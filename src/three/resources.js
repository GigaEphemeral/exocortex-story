/**
 * 资源登记表：所有 geometry / material / texture / renderer 在初始化时登记，
 * dispose() 时逆序批量释放（renderer 最后释放），避免 GPU 资源泄漏。
 */

export function createResourceRegistry() {
  /** @type {Array<{ dispose: () => void }>} */
  const items = [];
  let disposed = false;

  return {
    /**
     * @template {{ dispose: () => void }} T
     * @param {T} resource
     * @returns {T}
     */
    add(resource) {
      if (resource && typeof resource.dispose === 'function' && !items.includes(resource)) {
        items.push(resource);
      }
      return resource;
    },
    /** @returns {number} 已登记的资源数量（验收/诊断用） */
    get size() {
      return items.length;
    },
    isDisposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const resource = items[i];
        try {
          resource.dispose();
        } catch (error) {
          // 单个资源释放失败不阻断其余资源，也不每帧重复打印。
          console.warn('[scene] 资源释放失败：', error?.message ?? error);
        }
      }
      items.length = 0;
    },
  };
}
