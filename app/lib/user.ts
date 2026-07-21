const USER_ID_KEY = "user_id";

export function getBrowserUserId() {
  const existingUserId = window.localStorage.getItem(USER_ID_KEY);
  if (existingUserId) {
    return existingUserId;
  }

  const userId = crypto.randomUUID();
  window.localStorage.setItem(USER_ID_KEY, userId);
  return userId;
}
