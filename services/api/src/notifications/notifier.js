import { addNotification } from "../store.js";

// Notifications (spec §3.9 communications centre). Persists an in-app
// notification and (stub) pushes it. A real build sends FCM here using the
// user's device token; wire the FCM Admin SDK in sendPush().

function sendPush(_phone, title, _body) {
  // TODO: FCM Admin SDK send to the user's device token(s).
  console.log(`[push] ${title}`);
}

/** Record an in-app notification and fire a push. */
export function notify(phone, title, body, type = "info") {
  const note = addNotification(phone, { title, body, type });
  sendPush(phone, title, body);
  return note;
}
