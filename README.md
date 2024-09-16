# Holi App Volunteering

The backend for handling Volunteering projects, including a GraphQL API for
[Volunteering](https://voltastics.com/).

<!-- TOC -->

- [Holi App Volunteering](#holi-app-volunteering)
  - [Getting started](#getting-started)
    - [Setup](#setup)
    - [Code style](#code-style)
    - [Dependencies](#dependencies)
    - [Compiling (optional)](#compiling-optional)
    - [Testing](#testing)
    - [Tasks](#tasks)
    - [VS Code extension](#vs-code-extension)
  - [Local execution](#local-execution)
    - [Environment Variables](#environment-variables)
    - [Running](#running)
  - [Continuous Integration and Deployment](#continuous-integration-and-deployment)
    - [Skipping parts of CI](#skipping-parts-of-ci)
      - [noenv Branches](#noenv-branches)
  - [Runtime / Deployment](#runtime--deployment)
    - [Configuration](#configuration)

<!-- /TOC -->

## Getting started

### Setup

Install [`deno`](https://github.com/denoland/deno_install) in version 1.40.1.

as well as [`Velociraptor`](https://velociraptor.run/docs/installation/).

### Code style

Linting:

```sh
vr lint
```

Formatting:

```sh
vr fmt
```

Configuration for
[typescript](https://deno.land/manual/typescript/configuration),
[linter](https://deno.land/manual/tools/linter) or
[formatter](https://deno.land/manual/tools/formatter) can be added in
`deno.json`.

See the [deno manual](https://deno.land/manual/tools) for more tools.

### Dependencies

All dependencies should be added in `app/deps.ts` (similiar as you would do in a
Node.js `package.json`) for caching and integrity checks. After adding a
dependency run:

```sh
vr updateDeps
```

to update the `deno.lock` file (similiar to Node.js `package.lock` including
hashes).

To just install and cache dependencies locally or force a reload of
dependencies, run

```sh
vr install
```

### Compiling (optional)

Deno will compile all TypeScript code to JavaScript and cache the resulting
files. This will happen automatically when you run the code, but you can also
trigger this manually by running:

```sh
vr cache
```

### Testing

Tests can be executed with

```sh
vr test
```

(Test filenames should end on a `_test` prefix).

To get information about test coverage use

```sh
vr coverage
```

For more information, e.g. on how to create different coverage formats, see the
[documentation](https://deno.land/manual/testing/coverage)

### Tasks

We use [`Velociraptor`](https://velociraptor.run/) to execute scripts that are
defined beneath `velociraptor > scripts` in `deno.json` (similiar to scripts
defined in Node.js `package.json`).

You can run

```sh
vr
```

to get a list of all available tasks.

### VS Code extension

There is an official VS Code extension for Deno:
[vscode-deno](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno).

It should already be enabled for the workspace, for more information check the
[documentation](https://deno.land/manual/vscode_deno).

JetBrains also offers a
[plugin](https://plugins.jetbrains.com/plugin/14382-deno) for WebStorm and other
JetBrains IDEs.

## Local execution

### Environment Variables

If you haven't done so yet, please `cp .envrc.local.template .envrc.local`.
Then, within `.envrc.local`, set the environment variables required for the
service to run. Please see the [configuration section](#configuration) to learn
about the possible environment values, their purpose and where to find the
values.

### ML Recommendations

In the context of HOLI-8190 recommendations were introduced. Recommendations
are based on embeddings that were previously created by an ML pipeline and
stored in a Postgres database within Google Cloud. These are currently not
locally available. The endpoints `engagementRecommendations` & `engagementRecos`
rely on a connection to the aforementioned database that is only accessible to holi
employees (unless running the service with the environment variable `FAKE=true`).

### Running

To watch for file changes during development, run

```sh
vr dev
```

To execute the application without watching for file changes run

```sh
vr start
```

or run

```sh
vr docker
```

to execute the application in a local docker container.

Afterwards you can access the graphql playground here:

`http://localhost:8004/graphql`

## Continuous Integration and Deployment

### Skipping parts of CI

Sometimes, changes don't need to be verified by the full pipeline, e.g. changes
in linting or documentation.

#### noenv Branches

When you prefix your branch name with `noenv/` (e.g. `noenv/my-readme-update`)
the pipeline only lints & builds, but does not publish, deploy or run e2e test.
This saves quite some time. Obviously, many things go untested so only use this
if "you know what you're doing".

## Runtime / Deployment

### Configuration

| Environment Variable            | Default Value                                                                                | Description                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| PORT                            | 8004                                                                                         | the port to listen on                                   |
| CACHE_ENABLED                   | true                                                                                         | whether or not to enable caching                        |
| CACHE_TTL_MS_VOLTASTICS         | 24 hours                                                                                     | time-to-live in ms for data fetched from Voltastics API |
| CACHE_TTL_MS_DB                 | 1 hour                                                                                       | time-to-live in ms for data fetched from DB             |
| VOLUNTEERING_VOLTASTICS_API_URL | undefined                                                                                    | Voltastics API base URL                                 |
| VOLUNTEERING_VOLTASTICS_API_KEY | undefined                                                                                    | Voltastics API Token                                    |
| IMAGE_PROXY_BASE_URL            | <https://images.holi.social> (production), <https://dev-images.holi.social> (all other envs) | Base URL for the image proxy server                     |
| GEO_API_ENDPOINT_URL            | undefined                                                                                    | GraphQL Endpoint URL for holis Geo API                  |
