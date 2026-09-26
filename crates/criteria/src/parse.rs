//! Builds [`Revealed`] from full Myna Portal responses (prover-side pre-check, tests).

use crate::Revealed;
use base64::Engine;
use serde_json::Value;

/// `get-medicine-info`: every `drugN` in the response.
pub fn medicine(resp: &Value) -> Revealed {
    let mut drug_names = Vec::new();
    let years = resp.pointer("/resBody/drugInfoGetResults").and_then(Value::as_array);
    for year in years.into_iter().flatten().filter_map(Value::as_object) {
        for y in year.values() {
            let dates = y.get("drugInfoDetailListByDate").and_then(Value::as_array);
            for date in dates.into_iter().flatten().filter_map(Value::as_object) {
                for visits in date.values().filter_map(Value::as_array) {
                    for visit in visits {
                        let drugs = visit.get("drugInfoContentList").and_then(Value::as_array);
                        for d in drugs.into_iter().flatten() {
                            if let Some(n) = d.get("drugN").and_then(Value::as_str) {
                                drug_names.push(n.to_owned());
                            }
                        }
                    }
                }
            }
        }
    }
    Revealed::Prescription { drug_names }
}

/// `selfinfo/get` for ID 82: status plus (personInitemCd, personInitemContent) pairs.
pub fn nanbyo(resp: &Value) -> Revealed {
    let res = resp.get("resBody").cloned().unwrap_or(Value::Null);
    let status = res.get("selfiTranStatusCd").and_then(Value::as_str).unwrap_or("").to_owned();
    let mut items = Vec::new();
    for r in res.get("resultList").and_then(Value::as_array).into_iter().flatten() {
        if r.get("personInfoNameCd").and_then(Value::as_str) != Some("TM00000000000082") {
            continue;
        }
        for it in r.get("personInfoNameDetailList").and_then(Value::as_array).into_iter().flatten() {
            let cd = it.get("personInitemCd").and_then(Value::as_str).unwrap_or("");
            let content = it.get("personInitemContent").and_then(Value::as_str).unwrap_or("");
            items.push((cd.to_owned(), content.to_owned()));
        }
    }
    Revealed::Nanbyo { status, items }
}

/// PMH `send-medicalsubsidy`: decodes `encodedResponseData` and collects
/// `copaymentLimitManageFormCode` ("00"/empty = none).
pub fn pmh(resp: &Value) -> Revealed {
    let decoded = resp
        .pointer("/resBody/encodedResponseData")
        .and_then(Value::as_str)
        .and_then(|s| base64::engine::general_purpose::STANDARD.decode(s).ok())
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or(Value::Null);
    let form_codes = decoded
        .get("medicalSubsidyInfo")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|i| i.pointer("/medicalSubsidy/copaymentLimitManageFormCode")?.as_str())
        .filter(|c| !c.is_empty() && *c != "00")
        .map(str::to_owned)
        .collect();
    Revealed::Pmh { form_codes }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{evaluate_with, Catalog, Method, Ymd};
    use serde_json::json;

    const TODAY: Ymd = Ymd { y: 2026, m: 9, d: 26 };

    #[test]
    fn medicine_shape() {
        let resp = json!({"resultCode":"0000","resBody":{"drugInfoGetResults":[
            {"2025": {"summary":"0"}},
            {"2026": {"summary":"1","drugInfoDetailListByDate":[
                {"2026年5月19日": [{"medicalInstitutionName":"X","drugInfoContentList":[
                    {"drugN":"クラリス錠２００","kbn":"内服"},
                    {"drugN":"ビラノア錠２０ｍｇ","kbn":"内服"}]}]}]}}]}});
        let r = medicine(&resp);
        assert_eq!(r, Revealed::Prescription {
            drug_names: vec!["クラリス錠２００".into(), "ビラノア錠２０ｍｇ".into()]
        });
        assert!(evaluate_with(&Catalog::default_catalog(), "hayfever", Method::Prescription, &r, TODAY).passed);
    }

    #[test]
    fn nanbyo_empty_and_positive() {
        let none = json!({"resultCode":"0000","resBody":{"dateToday":"20260926","selfiTranStatusCd":"04"}});
        let r = nanbyo(&none);
        assert!(!evaluate_with(&Catalog::default_catalog(), "nanbyo-any", Method::Nanbyo, &r, TODAY).passed);

        let pos = json!({"resultCode":"0000","resBody":{"selfiTranStatusCd":"03","resultList":[
            {"personInfoNameCd":"TM00000000000082","personInfoNameDetailList":[
                {"hierarchy":"1","personInitemCd":"8200000010","personInitemContent":""},
                {"hierarchy":"2","personInitemCd":"8200000020","personInitemContent":"202504"},
                {"hierarchy":"2","personInitemCd":"8200000030","personInitemContent":"202703"}]}]}});
        let r = nanbyo(&pos);
        assert!(evaluate_with(&Catalog::default_catalog(), "nanbyo-any", Method::Nanbyo, &r, TODAY).passed);
    }

    #[test]
    fn pmh_decodes_base64() {
        let inner = json!({"medicalSubsidyInfo":[
            {"medicalSubsidy":{"certificationName":"特定医療費受給者証","copaymentLimitManageFormCode":"54"}},
            {"medicalSubsidy":{"copaymentLimitManageFormCode":"00"}}]});
        let enc = base64::engine::general_purpose::STANDARD.encode(inner.to_string());
        let resp = json!({"resultCode":"0000","resBody":{"encodedResponseData": enc}});
        assert_eq!(pmh(&resp), Revealed::Pmh { form_codes: vec!["54".into()] });
        let err = json!({"resultCode":"9000","errors":[{"errorCode":"ELT106"}]});
        assert_eq!(pmh(&err), Revealed::Pmh { form_codes: vec![] });
    }
}
