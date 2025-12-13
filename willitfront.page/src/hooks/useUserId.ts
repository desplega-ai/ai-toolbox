import { useState } from 'react';

const USER_ID_KEY = 'hn-tool:userId';

function getUserId(): string {
  let userId = localStorage.getItem(USER_ID_KEY);

  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, userId);
  }

  return userId;
}

export function useUserId(): string {
  const [userId] = useState(() => getUserId());
  return userId;
}
