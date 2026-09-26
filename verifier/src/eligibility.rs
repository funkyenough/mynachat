//! Adapter from what the MPC-TLS session disclosed to `crates/criteria`.

use serde_json::{json, Value};

/// What the verifier learned from the MPC-TLS session (only authenticated,
/// deliberately revealed bytes end up here).
#[derive(Debug, Clone, Default)]
pub struct Disclosed {
    /// Request path from the revealed request line, e.g. `/api/my/healthinfo/get-medicine-info`.
    pub request_path: String,
    /// JSON `"key":"value"` string pairs found fully inside revealed response ranges, in order.
    pub fields: Vec<(String, String)>,
}

#[derive(Debug, Clone)]
pub struct Verdict {
    pub passed: bool,
    pub evidence: Value,
}

fn fail(group_id: &str, reason: impl Into<String>) -> Verdict {
    Verdict { passed: false, evidence: json!({ "groupId": group_id, "reason": reason.into() }) }
}

/// The Myna Portal endpoint each method must have been proven against.
fn expected_path(method: criteria::Method) -> &'static str {
    use criteria::Method::*;
    match method {
        Prescription => "/api/my/healthinfo/get-medicine-info",
        Nanbyo => "/api/my/selfinfo/get",
        Pmh => "/api/my/pmh-info/send-medicalsubsidy/v3",
        Diagnosis => "/api/my/healthinfo/get-six-medical-info",
    }
}

fn values<'a>(d: &'a Disclosed, key: &'a str) -> impl Iterator<Item = &'a str> + 'a {
    d.fields.iter().filter(move |(k, _)| k == key).map(|(_, v)| v.as_str())
}

fn to_criteria(method: criteria::Method, d: &Disclosed) -> Result<criteria::Revealed, String> {
    use criteria::{Method, Revealed};
    match method {
        Method::Prescription => Ok(Revealed::Prescription { drug_names: values(d, "drugN").map(str::to_owned).collect() }),
        Method::Nanbyo => {
            let status = values(d, "selfiTranStatusCd").next().unwrap_or("").to_owned();
            // A record only counts if it is visibly the ID 82 item; the request body isn't revealed.
            if status == "03" && !values(d, "personInfoNameCd").any(|c| c == "TM00000000000082") {
                return Err("revealed records are not 自己情報 ID 82".into());
            }
            // personInitemCd / personInitemContent come in order; pair each code with the next content.
            let mut items = Vec::new();
            let mut code: Option<&str> = None;
            for (k, v) in &d.fields {
                match k.as_str() {
                    "personInitemCd" => code = Some(v),
                    "personInitemContent" => {
                        if let Some(c) = code.take() {
                            items.push((c.to_owned(), v.clone()));
                        }
                    }
                    _ => {}
                }
            }
            Ok(Revealed::Nanbyo { status, items })
        }
        // PMH wraps its data in base64 and diagnosis isn't live; both need more than pair disclosure.
        Method::Pmh | Method::Diagnosis => Err(format!("method {method:?} is not supported by the verifier yet")),
    }
}

pub fn evaluate(group_id: &str, method: &str, d: &Disclosed) -> Verdict {
    let Ok(method) = method.parse::<criteria::Method>() else {
        return fail(group_id, format!("unknown method {method}"));
    };
    if d.request_path != expected_path(method) {
        return fail(group_id, format!("proof is for {}, not {}", d.request_path, expected_path(method)));
    }
    let revealed = match to_criteria(method, d) {
        Ok(r) => r,
        Err(e) => return fail(group_id, e),
    };
    let v = criteria::evaluate(group_id, method, &revealed);
    Verdict { passed: v.passed, evidence: json!({ "groupId": group_id, "evidence": v.evidence }) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn disclosed(path: &str, fields: &[(&str, &str)]) -> Disclosed {
        Disclosed {
            request_path: path.into(),
            fields: fields.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        }
    }

    #[test]
    fn prescription_uses_catalog() {
        let d = disclosed("/api/my/healthinfo/get-medicine-info", &[("drugN", "ビラノア錠２０ｍｇ")]);
        assert!(evaluate("hayfever", "prescription", &d).passed);
        assert!(!evaluate("sma", "prescription", &d).passed);
    }

    #[test]
    fn wrong_endpoint_rejected() {
        let d = disclosed("/api/my/healthinfo/get-czdi-info", &[("drugN", "ビラノア錠２０ｍｇ")]);
        assert!(!evaluate("hayfever", "prescription", &d).passed);
    }

    #[test]
    fn nanbyo_requires_id82() {
        let fields = [
            ("selfiTranStatusCd", "03"),
            ("personInfoNameCd", "TM00000000000082"),
            ("personInitemCd", "8200000020"),
            ("personInitemContent", "202504"),
            ("personInitemCd", "8200000030"),
            ("personInitemContent", "209912"),
        ];
        assert!(evaluate("nanbyo-any", "nanbyo", &disclosed("/api/my/selfinfo/get", &fields)).passed);
        let mut other = fields;
        other[1] = ("personInfoNameCd", "TM00000000000001");
        assert!(!evaluate("nanbyo-any", "nanbyo", &disclosed("/api/my/selfinfo/get", &other)).passed);
        let none = [("selfiTranStatusCd", "04")];
        assert!(!evaluate("nanbyo-any", "nanbyo", &disclosed("/api/my/selfinfo/get", &none)).passed);
    }
}
