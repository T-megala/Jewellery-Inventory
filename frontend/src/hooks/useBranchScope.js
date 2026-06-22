import { useEffect, useState } from 'react'
import {
  BRANCH_CHANGE_EVENT,
  getActiveBranch,
  getActiveBranchId,
  getSessionBranches,
} from '../services/auth.js'

export function useBranchScope() {
  const [scope, setScope] = useState(() => ({
    activeBranchId: getActiveBranchId(),
    activeBranch: getActiveBranch(),
    sessionBranches: getSessionBranches(),
  }))

  useEffect(() => {
    function syncScope() {
      setScope({
        activeBranchId: getActiveBranchId(),
        activeBranch: getActiveBranch(),
        sessionBranches: getSessionBranches(),
      })
    }

    window.addEventListener(BRANCH_CHANGE_EVENT, syncScope)
    return () => window.removeEventListener(BRANCH_CHANGE_EVENT, syncScope)
  }, [])

  return scope
}
