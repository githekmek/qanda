// Only loaded in isolated integration child processes; never by the application.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const nodemailer = require("nodemailer");
nodemailer.createTransport = (options) => {
  if (options.host !== "smtp.gmail.com" || options.port !== 465 || options.secure !== true ||
      options.auth.user !== "sender@gmail.com" || options.auth.pass !== "isolated-test-password" ||
      options.disableFileAccess !== true || options.disableUrlAccess !== true ||
      options.logger !== false || options.debug !== false ||
      !process.env.TEST_MAIL_URL?.startsWith("http://127.0.0.1:")) {
    throw new Error("Invalid isolated Gmail transport configuration");
  }
  return {
    async sendMail(message) {
      const response = await fetch(process.env.TEST_MAIL_URL, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer isolated-test-key" },
        body: JSON.stringify(message),
      });
      if (!response.ok) throw new Error("Isolated SMTP rejection");
      return { accepted: [message.to[0].address], messageId: "test" };
    },
    close() {},
  };
};
