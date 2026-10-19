# Security policy

## Supported versions

Security fixes are released for the latest minor version of `react-smart-copy`.
Upgrading within the same major version is always safe: the public API is stable
under [semantic versioning](https://semver.org).

| Version | Supported |
| ------- | --------- |
| 1.x (latest minor) | Yes |
| Older 1.x minors | Upgrade to the latest minor |
| 0.x | No |

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub's private reporting: open the repository's **Security** tab and choose
**Report a vulnerability**
([direct link](https://github.com/suprabhat02/react-smart-copy/security/advisories/new)).
If you cannot use GitHub, email **suprabhatkumar02@gmail.com** with "Security" in the subject.

Please include:

- the affected entry point (`react-smart-copy`, `/core`, `/markdown`, `/link`, ...) and version
- the browser and version, if it matters
- a minimal reproduction: the payload, the pasted or dropped content, or the file
- the impact you see (script execution, data leaking to the clipboard, a crash, a hang)

## What to expect

- An acknowledgement within 3 working days.
- An assessment, with severity, within 7 days.
- A fix released as soon as it is ready. Critical issues are fixed within 14 days of
  confirmation. A GitHub Security Advisory and a CVE are published with the fix.
- Credit in the advisory if you would like it.

## Scope

In scope: anything in the published package. Examples are script execution through
pasted, dropped or copied content; URL or scheme validation bypasses in
`react-smart-copy/link` and `react-smart-copy/markdown`; hidden-character detection
bypasses in `react-smart-copy/code`; metadata that `react-smart-copy/image` reports as
removed but leaves behind; and denial of service through crafted input.

Out of scope: the documentation site's demo content, and issues that need a
compromised browser or a malicious extension.

## How releases are protected

Every version is published from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements), so you can
verify that a tarball was built from this repository: `npm audit signatures`. The
package has no runtime dependencies. CodeQL and the OpenSSF Scorecard run on every
change.
