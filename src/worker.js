// Serves the static site from ./public and sends www to the bare domain.
// The Buffer posting job and the index API will live here later, as on qbitoro.com.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.jobexposureindex.com") {
      url.hostname = "jobexposureindex.com";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
