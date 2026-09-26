# mynamedical

Lets a patient-group member prove, from their own Myna Portal session, that they hold a specific certification (e.g. 指定難病), without revealing their records or their identity to the group.

Built on TLSNotary MPC-TLS, with a verifier run by the patient group and identity binding through the My Number Card's JPKI signing certificate.

- Architecture draft: [`docs/architecture.html`](docs/architecture.html) (page content only; it's also published as a rendered page)

## Status

Phase 0 (recon): find the Myna Portal request that returns the certification, and record its host, auth style and response size.

Known so far: `myna.go.jp` accepts TLS 1.2 with `ECDHE-RSA-AES128-GCM-SHA256`, the suite TLSNotary implements.
