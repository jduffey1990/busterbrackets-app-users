# Render to Lambda migration

Render's free tier spins services down, and the ~50s spin-up makes the app look broken.
Both APIs move to Lambda behind API Gateway HTTP APIs, in Jordan's main AWS account, us-east-2.
The UI is already on Amplify (`busterbrackets-ui`, console-managed) and only its two `VITE_*` base URLs change.
Render keeps running until cutover is verified, so there is no flag day.

This plan lives in the users repo because `~/code/buster` is not a repo; it covers both services.

## Target

| | users | brackets |
|---|---|---|
| Hostname | `users-api.busterbrackets.com` | `brackets-api.busterbrackets.com` |
| Lambda | `bb-users`, nodejs22.x, x86_64, 1024MB, 10s | `bb-brackets`, nodejs22.x, x86_64, 1024MB, 29s |
| Reserved concurrency | 25 | 25 |
| Deploy | CodePipeline V2 on push to `main`, CodeBuild on AL2023 | same |
| Warm-up | none, cold starts accepted for a low-traffic portfolio site | same |
| Alarms | errors, duration, throttles, API 5xx to SNS email | same |
| State key | `users/terraform.tfstate` | `brackets/terraform.tfstate` |

Decisions and why:

- Two hostnames instead of one shared API domain, so each repo's Terraform owns its own certificate and records.
- `busterbrackets.com` DNS is in this account's Route 53, so ACM validation and alias records are Terraform-managed with no manual DNS step.
- Hapi answers CORS; API Gateway has no CORS config, or it would swallow preflights.
- The Lambda code is `ignore_changes` in Terraform, so an apply never reverts CodeBuild's deploy to the placeholder zip.
  TOB and mozaiq lack this; a later apply there resets production code.
- CodeBuild runs Amazon Linux 2023, the Lambda runtime's OS, so native `bcrypt` links against the right glibc.
- Secrets stay in Lambda environment variables, matching the other projects.
  They also land in Terraform state, so the state bucket is private, encrypted, and TLS-only.
- The existing `duffey-connect` GitHub connection is reused, not a seventh one created.
- `@codegenie/serverless-express` directly; `@vendia/serverless-express` is a deprecated shim over it.
- The 29s brackets timeout is for the synchronous OpenAI breakdown call; API Gateway caps every request at 30s.

## Phases

### Phase 0 - users repo cleanup (done)

The unpushed commit `81528f9` added TOB's production secrets in `terraform/terraform.tfvars` to this public repo.
It was undone with `git reset --soft`, keeping every file, and work moved to `feat/lambda-migration`.
`.gitignore` now covers `terraform.tfvars`, state, `.terraform/`, and `deployment.zip`.

Left for a separate `chore/` branch: `origin/main` tracks 8,766 `node_modules` files and 9 `dist` files.

### Phase 1 - state bucket (applied 2026-11-05)

`terraform/bootstrap/` creates `busterbrackets-tfstate-us-east-2` with local state.

### Phase 2 - users on Lambda (applied and deployed by hand 2026-11-05)

- `src/server.ts` builds the Hapi server; `src/app.ts` listens locally; `src/lambda.ts` is the Lambda handler.
- `src/lambda.test.ts` drives the handler with real API Gateway v2 events.
- `terraform/` is rewritten from the mozaiq `api-users` pattern plus TOB's domain and monitoring.
- `buildspec.yml` tests, builds, prunes, zips, deploys, and waits for the update.
- `Dockerfile` moves to Node 22 to match the Lambda runtime.

#### Phase gate - as built

- Test coverage: 7 jest tests on the handler (Mongo connected once per container, cold-start retry after a failed connect, 401 on a protected route, CORS preflight, Stripe webhook signed plain body, base64 body, tampered body).
  Mutation check: switching the adapter to API Gateway v1 turns 5 of 7 red.
  Ran twice, green both times.
- Coverage gaps: no tests exist for any users route beyond the above (pre-existing); Terraform is validated offline only, never planned against AWS; real cold-start time and the Atlas connect from Lambda are unmeasured until the first deploy.
- Verified by hand: local Docker on Node 22 boots, `GET /` is 401, seed-user login returns a token.
- DRY: `server.ts` mirrors brackets' `createServer`; the Terraform duplicates across the two repos by design (separate repos, separate pipelines), noted in `main.tf`.
- Modularity: Lambda adaptation lives only in `lambda.ts`; routes and services are untouched.
- Orthogonality: the state bucket name is shared by `bootstrap/main.tf` and both `provider.tf` files; `payload_format_version = "2.0"` is coupled to `eventSourceName` in `lambda.ts`.
  Each is noted in a code comment.
- Security review: Lambda role is logs-only; CodeBuild can update only this function and no longer receives `MONGO_URI`; pipeline role is scoped to its bucket, project, and connection; stage throttling 100 burst / 50 rps; webhook signature verified through the real adapter; no secrets in tracked files.
- Branch and production guard: all work is uncommitted on `feat/lambda-migration`; nothing was applied to AWS; AWS was only read.

### Phase 3 - brackets on Lambda (applied and deployed by hand 2026-11-05)

Same shape as Phase 2, on `feat/lambda-migration` in the brackets repo, with a 29s timeout and `OPENAI_API_KEY` and `ADMIN_USER_ID` in the environment.
The OpenAI breakdown call aborts at 20s so a slow upstream degrades to stats-only instead of a 503.
Node 22 moves together in `Dockerfile`, `.github/workflows/ci.yml`, and `.no-mistakes.yaml` (Node 20 is end of life).
The `.no-mistakes.yaml` change only takes effect after it merges to `main`; the suite passes on Node 20 and 22.
The phase gate record is in `brackets/docs/PLAN.md` under "Lambda migration".

Apply and deploy follow the runbook below.

### Phase 4 - cutover (in progress)

Status on 2026-11-05:

- Done: Atlas allows `0.0.0.0/0`; the second Stripe endpoint exists and `stripe_webhook_secret` holds its secret; both custom domains answer; Amplify points at the new hostnames and the live bundle has no `onrender.com`; both pipelines deploy from `main` (`Succeeded` 10:20 and 10:31 MT).
- Also shipped: `MongoClient` fails server selection in 5s, under both Lambda timeouts (`fix/mongo-connect-timeout` in both repos).
- Unverified: the Stripe test webhook result; a signed-in pass on the live site (bracket list, builder, odds, breakdown); a real purchase through the new endpoint.

**Resume here:** step 5 below, then step 6 after a few quiet days.

1. Confirm Atlas Network Access allows `0.0.0.0/0`; Lambda has no fixed egress IP without a NAT gateway (~$32/mo).
2. In Stripe, add a second webhook endpoint at `terraform output stripe_webhook_url`, keeping the Render one, and put its signing secret in `stripe_webhook_secret`.
3. Smoke test both APIs on their custom domains.
4. In Amplify, set `VITE_USERS_BASE_URL` and `VITE_BRACKETS_BASE_URL` to the new hostnames and redeploy.
5. Watch alarms and a real purchase for a few days.
6. Remove the Render Stripe endpoint, then suspend both Render services.

Later, separate tasks: delete `VITE_GPT_API_KEY` from Amplify after rotating it; simplify the UI's 8s brackets timeout and `serverStatus` retry loop, which exist only for Render cold starts; add `ignore_changes` to the TOB and mozaiq Lambda code.

## Apply runbook (Jordan)

This is the flow that ran on 2026-11-05, before either branch merged.

Phase 1:

```bash
cd ~/code/buster/users/terraform/bootstrap
terraform init
terraform apply
```

Expect one bucket, its versioning, encryption, public-access block, and TLS policy: 5 to add.

Phase 2 and 3, per repo (`users`, then `brackets`):

```bash
cd ~/code/buster/<repo>/terraform
cp terraform.tfvars.example terraform.tfvars   # fill in from the Render env
terraform init
terraform plan
terraform apply
```

`jwt_secret` must be identical in both repos, or brackets rejects every users token.
The apply blocks a few minutes on ACM validation; Route 53 answers it automatically.
After it finishes, confirm the SNS subscription email.

CodePipeline runs once on creation against GitHub `main`.
Before the branch merges, `main` has no `buildspec.yml`, so that run fails and the Lambda stays the placeholder zip.
Until the merge, deploy by hand from a bundle built on the Lambda image, so native `bcrypt` matches the runtime:

```bash
cd ~/code/buster/<repo>
docker run --rm --platform linux/amd64 -v "$PWD":/src:ro -v "$PWD/.lambda-out":/out --entrypoint bash public.ecr.aws/lambda/nodejs:22 -c 'set -e; shopt -s globstar; mkdir /build && cd /build && cp -r /src/package.json /src/package-lock.json /src/tsconfig.json /src/src . && npm ci --no-audit --no-fund --loglevel=error >/dev/null && npm run build --silent && npm ci --omit=dev --no-audit --no-fund --loglevel=error >/dev/null && rm -f dist/**/*.test.js && rm -rf /out/* && cp -r dist node_modules package.json /out/ && echo BUILD_OK'
rm -f deployment.zip && (cd .lambda-out && zip -qr ../deployment.zip .)
aws lambda update-function-code --function-name bb-<repo> --zip-file fileb://deployment.zip --query LastUpdateStatus --output text
aws lambda wait function-updated-v2 --function-name bb-<repo> && echo DEPLOYED
```

After the merge, every push to `main` deploys through the pipeline, and `ignore_changes` keeps later applies from reverting the code.

Smoke test:

```bash
curl -s -w "  [%{http_code}]\n" https://users-api.busterbrackets.com/ping-user          # pinged backend [200]
curl -s -w "  [%{http_code}]\n" https://brackets-api.busterbrackets.com/ping-bracket    # pinged backend [200]
curl -s -o /dev/null -w "%{http_code}\n" https://brackets-api.busterbrackets.com/tournament-data/years   # 401
```

Then log in through `POST /login` and repeat the brackets calls with the token: `/tournament-data/years`, `/get-user-brackets?id=`, `/odds?year=`.
