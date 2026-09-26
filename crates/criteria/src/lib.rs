//! Group eligibility criteria, evaluated on what the prover revealed from its
//! Myna Portal responses.
//!
//! The verifier builds a [`Revealed`] from the disclosed transcript ranges and
//! calls [`evaluate`]. The `parse` module builds the same [`Revealed`] from a
//! full response, for prover-side pre-checks and tests.

pub mod parse;

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const DEFAULT_CATALOG: &str = include_str!("../../../groups/catalog.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Method {
    Prescription,
    Nanbyo,
    Pmh,
    Diagnosis,
}

impl std::str::FromStr for Method {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, String> {
        serde_json::from_value(serde_json::Value::String(s.to_owned()))
            .map_err(|_| format!("unknown method: {s}"))
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Catalog {
    pub groups: Vec<Group>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Group {
    pub id: String,
    pub methods: BTreeMap<Method, Criteria>,
}

/// Per-method criteria. Fields a method doesn't use are ignored.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Criteria {
    #[serde(default)]
    pub drug_stems: Vec<String>,
    #[serde(default)]
    pub copayment_limit_manage_form_codes: Vec<String>,
    #[serde(default)]
    pub medis_codes: Vec<String>,
}

impl Catalog {
    pub fn from_json(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }

    /// The catalog compiled in from `groups/catalog.json`.
    pub fn default_catalog() -> Self {
        Self::from_json(DEFAULT_CATALOG).expect("groups/catalog.json is valid")
    }

    pub fn group(&self, id: &str) -> Option<&Group> {
        self.groups.iter().find(|g| g.id == id)
    }
}

/// Calendar date (JST). Comparisons only need ordering.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Ymd {
    pub y: u32,
    pub m: u32,
    pub d: u32,
}

impl Ymd {
    /// Today in Japan (UTC+9), from the system clock.
    pub fn today_jst() -> Self {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        Self::from_days(((secs + 9 * 3600) / 86_400) as i64)
    }

    /// Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    fn from_days(z: i64) -> Self {
        let z = z + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
        let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
        let y = (yoe + era * 400 + i64::from(m <= 2)) as u32;
        Ymd { y, m, d }
    }

    /// Parses "YYYYMM", "YYYYMMDD", "YYYY-MM-DD", "YYYY/MM/DD", "YYYY年M月D日".
    /// A month-only value becomes the first (`end = false`) or last (`end = true`) day.
    pub fn parse(s: &str, end: bool) -> Option<Self> {
        let nums: Vec<u32> = s
            .split(|c: char| !c.is_ascii_digit())
            .filter(|p| !p.is_empty())
            .filter_map(|p| p.parse().ok())
            .collect();
        let (y, m, d) = match nums.as_slice() {
            [ymd] if s.trim().len() == 8 => (ymd / 10_000, ymd / 100 % 100, ymd % 100),
            [ym] if s.trim().len() == 6 => (ym / 100, ym % 100, if end { 31 } else { 1 }),
            [y, m] => (*y, *m, if end { 31 } else { 1 }),
            [y, m, d] => (*y, *m, *d),
            _ => return None,
        };
        (1..=12).contains(&m).then_some(Ymd { y, m, d })
    }
}

/// What the prover disclosed, per method.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", rename_all = "lowercase")]
pub enum Revealed {
    /// `drugN` values from get-medicine-info.
    Prescription { drug_names: Vec<String> },
    /// ID 82 自己情報: status plus (personInitemCd, personInitemContent) pairs in order.
    Nanbyo { status: String, items: Vec<(String, String)> },
    /// PMH 医療受給者証: copaymentLimitManageFormCode of each certificate.
    Pmh { form_codes: Vec<String> },
    /// 傷病名 (JP-CLINS Condition): MEDIS code plus statuses.
    Diagnosis { conditions: Vec<Condition> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Condition {
    pub code: String,
    pub verification_status: String,
    pub clinical_status: String,
}

impl Revealed {
    pub fn method(&self) -> Method {
        match self {
            Revealed::Prescription { .. } => Method::Prescription,
            Revealed::Nanbyo { .. } => Method::Nanbyo,
            Revealed::Pmh { .. } => Method::Pmh,
            Revealed::Diagnosis { .. } => Method::Diagnosis,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Verdict {
    pub passed: bool,
    /// Short, non-identifying reason, safe to store and show.
    pub evidence: String,
}

impl Verdict {
    fn pass(evidence: impl Into<String>) -> Self {
        Verdict { passed: true, evidence: evidence.into() }
    }
    fn fail(evidence: impl Into<String>) -> Self {
        Verdict { passed: false, evidence: evidence.into() }
    }
}

/// ID 82 item codes (personInitemCd).
pub mod id82 {
    pub const SUBSIDY_START: &str = "8200000020"; // 支給開始年月
    pub const SUBSIDY_END: &str = "8200000030"; // 支給終了年月
    pub const REGISTRATION_START: &str = "8200000070"; // 登録者証効力開始年月日
    pub const REGISTRATION_END: &str = "8200000080"; // 登録者証効力終了年月日
}

/// Evaluates `revealed` for `group_id` with the compiled-in catalog, as of today (JST).
pub fn evaluate(group_id: &str, method: Method, revealed: &Revealed) -> Verdict {
    evaluate_with(&Catalog::default_catalog(), group_id, method, revealed, Ymd::today_jst())
}

pub fn evaluate_with(
    catalog: &Catalog,
    group_id: &str,
    method: Method,
    revealed: &Revealed,
    today: Ymd,
) -> Verdict {
    let Some(group) = catalog.group(group_id) else {
        return Verdict::fail(format!("unknown group {group_id}"));
    };
    let Some(criteria) = group.methods.get(&method) else {
        return Verdict::fail(format!("group {group_id} does not accept {method:?}"));
    };
    if revealed.method() != method {
        return Verdict::fail("revealed data is for a different method");
    }
    match revealed {
        Revealed::Prescription { drug_names } => prescription(criteria, drug_names),
        Revealed::Nanbyo { status, items } => nanbyo(status, items, today),
        Revealed::Pmh { form_codes } => pmh(criteria, form_codes),
        Revealed::Diagnosis { conditions } => diagnosis(criteria, conditions),
    }
}

/// Index of the first criteria stem contained in `drug_name`, if any.
pub fn matching_stem<'a>(criteria: &'a Criteria, drug_name: &str) -> Option<&'a str> {
    criteria
        .drug_stems
        .iter()
        .map(String::as_str)
        .find(|stem| !stem.is_empty() && drug_name.contains(stem))
}

fn prescription(criteria: &Criteria, drug_names: &[String]) -> Verdict {
    for name in drug_names {
        if let Some(stem) = matching_stem(criteria, name) {
            return Verdict::pass(format!("prescribed {stem}"));
        }
    }
    Verdict::fail("no listed drug in revealed prescriptions")
}

fn nanbyo(status: &str, items: &[(String, String)], today: Ymd) -> Verdict {
    // 03 with items = records returned; 04 = nothing on record.
    if status != "03" && status != "02" {
        return Verdict::fail(format!("no 指定難病 record (status {status})"));
    }
    let covers = |start_cd: &str, end_cd: &str, label: &str| -> Option<Verdict> {
        // Periods are flattened in order: a start, then (optionally) its end.
        let mut start: Option<Ymd> = None;
        for (cd, content) in items {
            if cd == start_cd {
                if let Some(s) = start.take() {
                    if s <= today {
                        return Some(Verdict::pass(format!("{label}: open-ended period")));
                    }
                }
                start = Ymd::parse(content, false);
            } else if cd == end_cd {
                let end = if content.trim().is_empty() { None } else { Ymd::parse(content, true) };
                if let Some(s) = start.take() {
                    if s <= today && end.map_or(true, |e| today <= e) {
                        return Some(Verdict::pass(format!("{label}: valid today")));
                    }
                }
            }
        }
        match start {
            Some(s) if s <= today => Some(Verdict::pass(format!("{label}: open-ended period"))),
            _ => None,
        }
    };
    covers(id82::SUBSIDY_START, id82::SUBSIDY_END, "特定医療費")
        .or_else(|| covers(id82::REGISTRATION_START, id82::REGISTRATION_END, "登録者証"))
        .unwrap_or_else(|| Verdict::fail("no 指定難病 period covering today"))
}

fn pmh(criteria: &Criteria, form_codes: &[String]) -> Verdict {
    match form_codes
        .iter()
        .find(|c| criteria.copayment_limit_manage_form_codes.contains(c))
    {
        Some(code) => Verdict::pass(format!("受給者証 code {code}")),
        None => Verdict::fail("no matching 受給者証"),
    }
}

fn diagnosis(criteria: &Criteria, conditions: &[Condition]) -> Verdict {
    const UNCODED: char = '9'; // JP-CLINS: all-9s code = uncoded disease name
    let ok = conditions.iter().find(|c| {
        !c.code.chars().all(|ch| ch == UNCODED)
            && criteria.medis_codes.contains(&c.code)
            && c.verification_status == "confirmed"
            && matches!(c.clinical_status.as_str(), "active" | "remission")
    });
    match ok {
        Some(c) => Verdict::pass(format!("confirmed diagnosis {}", c.code)),
        None => Verdict::fail("no confirmed matching diagnosis"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn today() -> Ymd {
        Ymd { y: 2026, m: 9, d: 26 }
    }

    fn eval(group: &str, r: Revealed) -> Verdict {
        let method = r.method();
        evaluate_with(&Catalog::default_catalog(), group, method, &r, today())
    }

    #[test]
    fn catalog_loads() {
        let c = Catalog::default_catalog();
        assert!(c.group("hayfever").is_some());
        assert!(c.group("nanbyo-any").unwrap().methods.contains_key(&Method::Nanbyo));
        assert_eq!("prescription".parse::<Method>().unwrap(), Method::Prescription);
    }

    #[test]
    fn prescription_match_and_miss() {
        let hit = eval("hayfever", Revealed::Prescription { drug_names: vec!["ビラノア錠２０ｍｇ".into()] });
        assert!(hit.passed, "{hit:?}");
        assert_eq!(hit.evidence, "prescribed ビラノア");
        let miss = eval("hayfever", Revealed::Prescription { drug_names: vec!["クラリス錠２００".into()] });
        assert!(!miss.passed);
    }

    #[test]
    fn prescriptions_only_open_their_own_group() {
        let hay_fever = Revealed::Prescription { drug_names: vec!["ビラノア錠２０ｍｇ".into()] };
        let migraine = Revealed::Prescription { drug_names: vec!["イミグラン錠５０".into()] };
        assert!(eval("hayfever", hay_fever.clone()).passed);
        assert!(!eval("migraine", hay_fever).passed, "a hay fever drug must not open the migraine group");
        let v = eval("migraine", migraine.clone());
        assert!(v.passed, "{v:?}");
        assert_eq!(v.evidence, "prescribed イミグラン");
        assert!(!eval("hayfever", migraine).passed, "a migraine drug must not open the hay fever group");
    }

    #[test]
    fn method_not_accepted() {
        let v = eval("hayfever", Revealed::Pmh { form_codes: vec!["54".into()] });
        assert!(!v.passed);
    }

    #[test]
    fn nanbyo_periods() {
        let items = |pairs: &[(&str, &str)]| {
            pairs.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect::<Vec<_>>()
        };
        let current = Revealed::Nanbyo {
            status: "03".into(),
            items: items(&[(id82::SUBSIDY_START, "202504"), (id82::SUBSIDY_END, "202703")]),
        };
        assert!(eval("nanbyo-any", current).passed);

        let expired = Revealed::Nanbyo {
            status: "03".into(),
            items: items(&[(id82::SUBSIDY_START, "202204"), (id82::SUBSIDY_END, "202503")]),
        };
        assert!(!eval("nanbyo-any", expired).passed);

        let registration = Revealed::Nanbyo {
            status: "03".into(),
            items: items(&[
                (id82::SUBSIDY_START, "202204"),
                (id82::SUBSIDY_END, "202503"),
                (id82::REGISTRATION_START, "2025-06-01"),
                (id82::REGISTRATION_END, ""),
            ]),
        };
        assert!(eval("nanbyo-any", registration).passed);

        let none = Revealed::Nanbyo { status: "04".into(), items: vec![] };
        assert!(!eval("nanbyo-any", none).passed);
    }

    #[test]
    fn pmh_codes() {
        assert!(eval("nanbyo-any", Revealed::Pmh { form_codes: vec!["54".into()] }).passed);
        assert!(!eval("nanbyo-any", Revealed::Pmh { form_codes: vec!["52".into()] }).passed);
        assert!(eval("sma", Revealed::Pmh { form_codes: vec!["52".into()] }).passed);
    }

    #[test]
    fn diagnosis_requires_confirmed_coded_match() {
        let mut catalog = Catalog::default_catalog();
        let sma = catalog.groups.iter_mut().find(|g| g.id == "sma").unwrap();
        sma.methods.get_mut(&Method::Diagnosis).unwrap().medis_codes = vec!["20051234".into()];
        let cond = |code: &str, v: &str| Condition {
            code: code.into(),
            verification_status: v.into(),
            clinical_status: "active".into(),
        };
        let run = |c: Condition| {
            evaluate_with(&catalog, "sma", Method::Diagnosis, &Revealed::Diagnosis { conditions: vec![c] }, today())
        };
        assert!(run(cond("20051234", "confirmed")).passed);
        assert!(!run(cond("20051234", "unconfirmed")).passed);
        assert!(!run(cond("99999999", "confirmed")).passed);
    }

    #[test]
    fn dates() {
        assert_eq!(Ymd::parse("202604", true), Some(Ymd { y: 2026, m: 4, d: 31 }));
        assert_eq!(Ymd::parse("2026年5月19日", false), Some(Ymd { y: 2026, m: 5, d: 19 }));
        assert_eq!(Ymd::parse("2026/05/19", false), Some(Ymd { y: 2026, m: 5, d: 19 }));
        assert_eq!(Ymd::from_days(0), Ymd { y: 1970, m: 1, d: 1 });
        assert_eq!(Ymd::from_days(20_722), Ymd { y: 2026, m: 9, d: 26 });
    }
}
