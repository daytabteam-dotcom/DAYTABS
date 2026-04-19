# Render Static Wake Setup

This repo now supports a branded "wake" flow that hides Render's default cold-start page by keeping the frontend awake as a static site and waking the API in the background.

## Recommended architecture

- Static site:
  - serves the public marketing app
  - serves the branded `/wake` page
  - optionally serves the panel frontend as a static app
- Web service:
  - serves the API only
  - can stay on Render Free and spin down

## Required domains

- `daytabs.com` -> static site
- `api.daytabs.com` -> Render web service

This uses two custom domains, which fits Render Hobby workspace limits.

## Frontend environment variables

### Landing static site

- `VITE_API_BASE_URL=https://api.daytabs.com`
- `VITE_CORE_APP_URL=https://daytabs.com/panel/`

### Panel static site

- `VITE_API_BASE_URL=https://api.daytabs.com`
- `VITE_PUBLIC_SITE_URL=https://daytabs.com`

## API service environment variables

- `APP_URL=https://daytabs.com`
- `CORE_APP_URL=https://daytabs.com/wake`
- `CORS_ALLOWED_ORIGINS=https://daytabs.com`

With `CORE_APP_URL` pointed at `/wake`, OAuth and auth redirects land on the branded wake screen first instead of sending users straight at a sleeping app surface.

## What the code now does

- Landing auth flows route to `/wake?token=...`
- `/wake` polls `/api/healthz` on the configured API origin
- The panel frontend can also poll the API before rendering the workspace
- Relative `/api/*` frontend requests are rewritten to `VITE_API_BASE_URL` when configured

## Important note

If you keep the current single Render web service setup, Render's own cold-start page will still appear before any of your frontend code can run. The branded wake flow only replaces that experience when the frontend is deployed separately as a static site.
