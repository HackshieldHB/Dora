import net from "node:net";
import tls from "node:tls";
import type { Socket } from "node:net";

type Mail = { to: string; subject: string; body: string; attachment?: { filename: string; content: Buffer } };

/** Sends when SMTP_HOST is set. Without it, the notice stays in the email log. */
export async function deliverEmail(mail: Mail): Promise<"SENT" | "LOGGED"> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return "LOGGED";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || user;
  if (!from) throw new Error("Set SMTP_FROM to the address DORA should send from.");
  const implicitTls = process.env.SMTP_SECURE === "true" || port === 465;
  let socket: Socket = implicitTls ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  socket.setTimeout(15_000);
  try {
    await readReply(socket);
    await send(socket, "EHLO dora");
    if (!implicitTls) {
      await send(socket, "STARTTLS");
      socket = tls.connect({ socket, servername: host });
      socket.setTimeout(15_000);
      await send(socket, "EHLO dora");
    }
    if (user) {
      await send(socket, "AUTH LOGIN");
      await send(socket, Buffer.from(user).toString("base64"));
      await send(socket, Buffer.from(pass).toString("base64"));
    }
    await send(socket, `MAIL FROM:<${from}>`);
    await send(socket, `RCPT TO:<${mail.to}>`);
    await send(socket, "DATA");
    await send(socket, rawMessage(from, mail));
    await send(socket, "QUIT");
    return "SENT";
  } finally {
    socket.destroy();
  }
}

function rawMessage(from: string, mail: Mail) {
  const text = mail.body.replace(/\r?\n/g, "\r\n");
  const headers = [`From: ${from}`, `To: ${mail.to}`, `Subject: ${mail.subject}`, "MIME-Version: 1.0"];
  if (!mail.attachment) {
    return dotStuff([...headers, "Content-Type: text/plain; charset=utf-8", "", text].join("\r\n"));
  }
  const boundary = `dora_${Date.now()}`;
  const pdf = mail.attachment.content.toString("base64").replace(/(.{76})/g, "$1\r\n");
  const safeName = mail.attachment.filename.replace(/[^A-Za-z0-9._-]/g, "-");
  return dotStuff([
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${safeName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${safeName}"`,
    "",
    pdf,
    `--${boundary}--`,
  ].join("\r\n"));
}

function dotStuff(message: string) {
  return `${message.replace(/^\./gm, "..")}\r\n.`;
}

function send(socket: Socket, line: string) {
  socket.write(`${line}\r\n`);
  return readReply(socket);
}

function readReply(socket: Socket) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n").filter(Boolean);
      const last = lines.at(-1) || "";
      if (!/^\d{3} /.test(last)) return;
      cleanup();
      const code = Number(last.slice(0, 3));
      if (code >= 400) reject(new Error(last));
      else resolve(buffer);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };
    const onTimeout = () => onError(new Error("SMTP connection timed out."));
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("timeout", onTimeout);
  });
}
