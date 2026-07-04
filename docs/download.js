const downloadForm = document.querySelector("[data-download-form]");
const downloadStatus = document.querySelector("[data-download-status]");

if (downloadForm && downloadStatus) {
  downloadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = downloadForm.querySelector('input[name="email"]');
    const replyTo = downloadForm.querySelector('input[name="_replyto"]');
    const submitButton = downloadForm.querySelector('button[type="submit"]');
    const nextPage = downloadForm.querySelector('input[name="_next"]');

    if (email && replyTo) {
      replyTo.value = email.value;
    }

    downloadStatus.textContent = "sending...";
    if (submitButton) submitButton.disabled = true;

    try {
      const endpoint = new URL(downloadForm.action);
      endpoint.pathname = `/ajax${endpoint.pathname}`;

      const response = await fetch(endpoint.href, {
        method: "POST",
        body: new FormData(downloadForm),
        headers: {
          Accept: "application/json"
        }
      });
      const result = await response.json();

      if (!response.ok || (result.success !== true && result.success !== "true")) {
        throw new Error(result.message || "Unable to send download link.");
      }

      downloadStatus.textContent = "sent";
      window.location.assign(nextPage?.value || "download-thanks.html");
    } catch (error) {
      downloadStatus.textContent = error.message || "Unable to send download link.";
      if (submitButton) submitButton.disabled = false;
    }
  });
}
