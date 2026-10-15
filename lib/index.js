/**
 * dsh-think-intensity — host half.
 *
 * The feature is a browser surface: the client half (`./client`) renders the
 * slider into the conversation composer and drives the real `session.selectModel`
 * Remote, which also persists the choice as the default for later sessions.
 *
 * This half owns no service, route, or mutable user state — it exists so the
 * package is a mountable Loader row (and so `dsh.client` has a host sibling to
 * be scanned beside).
 *
 * @param ctx - the host root context owned by this row.
 */
export function apply(ctx) {
  ctx.logger.info('dsh-think-intensity: 思考强度滑块已挂载（浏览器半区见 ./client）')
}

export default {
  name: 'dsh-think-intensity',
  apply,
}
