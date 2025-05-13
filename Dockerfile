FROM europe-north1-docker.pkg.dev/holi-shared/docker-hub-remote/denoland/deno:2.2.13

# The port that your application listens to.
EXPOSE 8004

# Prefer not to run as root.
USER deno

COPY deno.lock .
COPY deno.json .
COPY ./app ./app

RUN deno cache --allow-import --lock=deno.lock app/deps.ts app/dev_deps.ts
RUN deno cache --allow-import --lock=deno.lock app/main.ts

CMD ["deno", "run", "--allow-import", "--allow-net", "--allow-env", "--lock=deno.lock", "--cached-only", "app/main.ts"]
