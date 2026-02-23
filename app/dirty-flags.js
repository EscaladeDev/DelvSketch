import { DIRTY_FLAGS } from "./constants.js"

export function createDirtyFlags(){
  const flags = {
    [DIRTY_FLAGS.WORLD]: true,
    [DIRTY_FLAGS.PROPS]: true,
    [DIRTY_FLAGS.OVERLAY]: true,
    [DIRTY_FLAGS.UI]: true,
    [DIRTY_FLAGS.EXPORT]: true,
  }

  return {
    mark(flag){ if (flag && Object.prototype.hasOwnProperty.call(flags, flag)) flags[flag] = true },
    clear(flag){ if (flag && Object.prototype.hasOwnProperty.call(flags, flag)) flags[flag] = false },
    markMany(list = []){ for (const f of list) if (Object.prototype.hasOwnProperty.call(flags, f)) flags[f] = true },
    markAll(){ for (const k of Object.keys(flags)) flags[k] = true },
    clearAll(){ for (const k of Object.keys(flags)) flags[k] = false },
    isDirty(flag){ return !!flags[flag] },
    snapshot(){ return { ...flags } }
  }
}
