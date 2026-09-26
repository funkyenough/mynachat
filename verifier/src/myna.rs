//! Myna Portal request definitions.

pub const SERVER_NAME: &str = "myna.go.jp";
pub const RELAY_TARGET: &str = "myna.go.jp:443";

/// `(path, body)` for a proof method.
pub fn request_for(method: &str) -> Option<(&'static str, &'static str)> {
    match method {
        "prescription" => Some((
            "/api/my/healthinfo/get-medicine-info",
            r#"{"commonHeader":{"screenId":"medicine_past_"}}"#,
        )),
        "nanbyo" => Some((
            "/api/my/selfinfo/get",
            r#"{"commonHeader":{"screenId":"home__________"},"reqBody":{"fieldCd":"","fieldDetailCd":"","personInfoNameCd":"TM00000000000082","targetYear":""}}"#,
        )),
        _ => None,
    }
}
