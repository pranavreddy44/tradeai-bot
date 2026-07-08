import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

const server = Bun.serve({
  port: 3098,
  fetch(req) {
    return new Response("OK - TelegramClient: " + typeof TelegramClient);
  },
});
console.log("Server with telegram import started on 3098");
