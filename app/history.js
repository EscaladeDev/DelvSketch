/**
 * Lightweight snapshot-based history manager (feature parity with previous app behavior).
 * This isolates stack management so future command-based history can swap in behind
 * the same push/undo/redo call sites.
 */
export function createHistoryManager({ limit = 200, snapshot, restore, onMutate } = {}) {
  if (typeof snapshot !== "function") throw new Error("createHistoryManager requires snapshot()")
  if (typeof restore !== "function") throw new Error("createHistoryManager requires restore(state)")

  const undoStack = []
  const redoStack = []

  function notify(){
    if (typeof onMutate === "function") {
      try { onMutate({ undoDepth: undoStack.length, redoDepth: redoStack.length }) } catch {}
    }
  }

  function pushUndo(){
    undoStack.push(snapshot())
    if (undoStack.length > limit) undoStack.shift()
    redoStack.length = 0
    notify()
  }

  function undo(){
    if (!undoStack.length) return false
    redoStack.push(snapshot())
    restore(undoStack.pop())
    notify()
    return true
  }

  function redo(){
    if (!redoStack.length) return false
    undoStack.push(snapshot())
    restore(redoStack.pop())
    notify()
    return true
  }

  function popUndo(){
    if (!undoStack.length) return null
    const value = undoStack.pop()
    notify()
    return value
  }

  function clear(){
    undoStack.length = 0
    redoStack.length = 0
    notify()
  }

  return {
    undoStack,
    redoStack,
    pushUndo,
    undo,
    redo,
    popUndo,
    clear,
    getState(){
      return { undoDepth: undoStack.length, redoDepth: redoStack.length }
    }
  }
}
