# Workflow files

Use the eight separate JSON files in [workflows](./workflows/).

Read [the setup guide](./workflows/README-VI.md) before you run a workflow.

`new-workflows-import.json` and `build-full-workflows.mjs` are earlier samples. Do not use them for the new system. Replace the sample workflows that you imported with the eight separate files. Each new schedule starts disabled.

To rebuild the files, run `node data-schema/build-production-workflows.mjs` from the repository root.

To check the files, run `node data-schema/verify-production-workflows.mjs` from the repository root.
