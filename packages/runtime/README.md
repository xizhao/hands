# @hands/harness

This is a harness app that runs apps in `@hands/runtime`.

It's basically a `rwsdk` app w/ tailwind and shadcn that sets up routes and lets you use the scripts to do dev and deploy.

- Sets up page routes for documents
- Sets up a block routes for rendering RSC partials so we can lazily render them in tree with automated suspense
- Wires itself to workbook
- Sets up db interface

We should try to keep workbooks clean and use the same harness, but per workbook we want to:

1. Do codegen from the pages
2. Cache the node_modules per workbook.
3. Components

Todo:

- [ ] Wire up FE RSC partials and prove that works
- [ ] Wire up backend rsc partials w db
- [ ] Wire up pages routing and MDX transform -> pages

big todo: I'm going to have to figure out how to port my pgtyped and pglite setup into cloudflare durable objects and the whole rwsdk setup -- liekly pglite -> sqlite bridge for deploy for now...

Maybe move away from pglite.
