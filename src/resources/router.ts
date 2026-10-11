import express, { type RequestHandler, type Router } from 'express';

export interface ResourceActions {
  index: RequestHandler;
  show: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  destroy: RequestHandler;
}

const parseBody: RequestHandler[] = [
  express.json({ type: ['application/json', 'text/x-json', 'application/jsonrequest'], strict: false, limit: '50mb' }),
  express.urlencoded({ extended: true, limit: '50mb' }),
];

// `resources :name` (API-only: no new/edit), with an optional `.:format` suffix like Rails routes.
// Authentication runs before the body is parsed, as SecuredController's before_action did.
export function mountResource(router: Router, name: string, authenticate: RequestHandler[], actions: ResourceActions) {
  const collection = `/${name}{.:format}`;
  const member = `/${name}/:id{.:format}`;
  const chain = (handler: RequestHandler) => [...authenticate, ...parseBody, handler];

  router.get(collection, chain(actions.index));
  router.post(collection, chain(actions.create));
  router.get(member, chain(actions.show));
  router.patch(member, chain(actions.update));
  router.put(member, chain(actions.update));
  router.delete(member, chain(actions.destroy));
}
