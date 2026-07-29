/** Marks a host as retained by KeepAlive while it is detached from the DOM. */
export const ELF_KEEP_ALIVE_FLAG: unique symbol = Symbol("elfui.keep-alive");

/** Lets KeepAlive complete a deferred unmount when a cached host is released. */
export const ELF_KEEP_ALIVE_RELEASE: unique symbol = Symbol("elfui.keep-alive-release");
