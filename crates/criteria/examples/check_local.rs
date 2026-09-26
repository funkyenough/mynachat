//! Evaluates the saved responses in myna_data/ (git-ignored) against every group.
//! Prints verdicts only.
//!
//!     cargo run --example check_local

use criteria::{evaluate, parse, Catalog, Method, Revealed};
use serde_json::Value;
use std::path::Path;

fn load(rel: &str) -> Option<Value> {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../myna_data").join(rel);
    let v: Value = serde_json::from_str(&std::fs::read_to_string(p).ok()?).ok()?;
    v.get("response").cloned()
}

fn main() {
    let sources: [(&str, fn(&Value) -> Revealed); 3] = [
        ("health/medicine-info.json", parse::medicine),
        ("selfinfo/082_TM00000000000082.json", parse::nanbyo),
        ("pmh/medicalsubsidy_list.json", parse::pmh),
    ];
    let catalog = Catalog::default_catalog();
    for (file, parser) in sources {
        let Some(resp) = load(file) else {
            println!("{file}: not found");
            continue;
        };
        let revealed = parser(&resp);
        let method: Method = revealed.method();
        for g in catalog.groups.iter().filter(|g| g.methods.contains_key(&method)) {
            let v = evaluate(&g.id, method, &revealed);
            println!("{:<12} {:<13} passed={:<5} {}", g.id, format!("{method:?}"), v.passed, v.evidence);
        }
    }
}
