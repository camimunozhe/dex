let pending = false;
export const requestCollectionRefresh = () => { pending = true; };
export const consumeCollectionRefresh = () => { const v = pending; pending = false; return v; };
