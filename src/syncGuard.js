export function isRemoteVersionNewer(localUpdatedAt, serverUpdatedAt) {
  return (serverUpdatedAt || 0) > (localUpdatedAt || 0);
}

export function shouldBlockSaveOverRemote({
  localUpdatedAt,
  localContent,
  serverUpdatedAt,
  serverContent,
  force = false,
  allowOverwrite = false,
}) {
  if (force || allowOverwrite) return false;
  if (!isRemoteVersionNewer(localUpdatedAt, serverUpdatedAt)) return false;
  return (localContent ?? '') !== (serverContent ?? '');
}

export function shouldRestoreDraftBackup({
  backupContent,
  backupTime,
  serverContent,
  serverUpdatedAt,
  localUpdatedAt,
}) {
  if ((backupContent ?? '') === (serverContent ?? '')) return false;
  if ((serverUpdatedAt || 0) > (localUpdatedAt || 0)) return false;
  if ((serverUpdatedAt || 0) === (localUpdatedAt || 0) && backupTime > serverUpdatedAt) {
    return true;
  }
  return false;
}

export function shouldQueueBackupConflict({
  backupContent,
  backupTime,
  serverContent,
  serverUpdatedAt,
  localUpdatedAt,
}) {
  if ((backupContent ?? '') === (serverContent ?? '')) return false;
  if ((serverUpdatedAt || 0) <= (localUpdatedAt || 0)) return false;
  return (backupContent ?? '') !== (serverContent ?? '');
}
