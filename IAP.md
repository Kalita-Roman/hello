# Personalized IAP greeting

The app displays `Hello, visitor@example.com!` using the signed-in visitor's
verified IAP email. IAP's standard identity claims contain an email and a stable
user ID, not a person's display name.

Each request must include `X-Goog-IAP-JWT-Assertion`. The server verifies its
signature, issuer, expiration, and audience with Google's authentication library.
Unsigned email headers are never used as proof of identity. Personalized responses
are sent as plain text with `Cache-Control: private, no-store`.

The default audience matches the existing Cloud Run service:

```
/projects/201316386962/locations/europe-central2/services/hello-git
```

For another service, set the `IAP_AUDIENCE` environment variable to that service's
Signed Header JWT Audience (available in the IAP service's overflow menu).
This is not the OAuth client ID.

Keep IAP enabled. Direct local requests without a signed assertion receive 401;
invalid assertions receive 403. After merging to `main`, the existing Cloud Build
trigger should build and deploy the change. Once the deployment succeeds, open the
service URL while signed in through IAP.

Run `npm ci` and `npm test` to check valid identities, forged headers, invalid
signatures, wrong audience/issuer, expired/future tokens, and missing identity claims.
The tests generate their own signing key; they do not need Google credentials.

Reference: https://cloud.google.com/iap/docs/signed-headers-howto
