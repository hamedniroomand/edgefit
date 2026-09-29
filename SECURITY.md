# Security Policy

## Supported versions

Security fixes go into the latest release. Please upgrade before reporting.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through [GitHub's private vulnerability reporting](https://github.com/hamedniroomand/edgefit/security/advisories/new). Include what you found, how to reproduce it, and what an attacker could do with it.

You should get a reply within a week. Once a fix is ready, it is released and the advisory is published with credit to you, unless you prefer to stay anonymous.

## What counts

edgefit runs on your machine and in CI, and loads your config file as code. Examples of issues we want to hear about:

- The GitHub Action exposing its token, or running untrusted code from a fork with write access.
- Reading or writing files outside the project it checks.
- A crafted package in `node_modules` causing code execution while edgefit scans it. edgefit parses dependencies; it never runs them.

A wrong compatibility result is a bug, not a vulnerability. Please [open an issue](https://github.com/hamedniroomand/edgefit/issues/new/choose) for those.
