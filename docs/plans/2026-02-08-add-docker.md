# Add `Dockerfile`

Add a `Dockerfile` to build a container image that runs the application.
- Reference the instructions in `README.md` and `CLAUDE.md` for how to build and run the project.
- Tag the image `aromasca/expenlytics:latest`.
- Determine the best way to allow the app to use the Anthropic API key. Don't package the API key with the image, maybe pass it in as an environment variable on container startup. Research the best practice here.
- Ensure the database contents are persisted between container restarts.
- Check for any issues/regressions that could happen when running the app in a Docker container vs "bare" and call these out.

---