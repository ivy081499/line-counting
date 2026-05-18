import { PENDING_ACTIONS } from './constants.js';

export function buildEditOrderPendingAction(rawMessageId) {
  return `${PENDING_ACTIONS.EDIT_ORDER_TEXT_PREFIX}${rawMessageId}`;
}

export function parseEditOrderPendingAction(pendingAction) {
  const rawMessageId = Number(
    String(pendingAction || "").slice(PENDING_ACTIONS.EDIT_ORDER_TEXT_PREFIX.length)
  );

  return { rawMessageId };
}
