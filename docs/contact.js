const contactForm = document.querySelector("[data-contact-form]");
const contactStatus = document.querySelector("[data-contact-status]");

if (contactForm && contactStatus) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    contactStatus.textContent = "sending...";

    try {
      const formData = new FormData(contactForm);
      const response = await fetch("https://formsubmit.co/ajax/phildeagletouchdown@gmail.com", {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json"
        }
      });

      const result = await response.json();

      if (!response.ok || (result.success !== true && result.success !== "true")) {
        throw new Error(result.message || "Unable to send message.");
      }

      contactStatus.textContent = "message sent";
      contactForm.reset();
    } catch (error) {
      contactStatus.textContent = error.message || "Unable to send message.";
    }
  });
}
