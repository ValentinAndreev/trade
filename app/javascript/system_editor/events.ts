export const SYSTEM_EDITOR_EVENTS = {
  CLOSE_FILE_PICKER: "system-editor:closeFilePicker",
  NAVIGATE_FILE_MANAGER: "system-editor:navigateFileManager",
  SELECT_FILE_MANAGER_ENTRY: "system-editor:selectFileManagerEntry",
  CONFIRM_FILE_SELECTION: "system-editor:confirmFileSelection",
  UPDATE_FILE_PICKER_QUERY: "system-editor:updateFilePickerQuery",
  CREATE_DIRECTORY: "system-editor:createDirectory",
  CREATE_FILE: "system-editor:createFile",
  RENAME_FILE_MANAGER_ENTRY: "system-editor:renameFileManagerEntry",
  DELETE_FILE_MANAGER_ENTRY: "system-editor:deleteFileManagerEntry",
} as const
