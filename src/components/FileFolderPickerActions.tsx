import React from 'react';
import { Files, FolderUp } from 'lucide-react';

interface FileFolderPickerActionsProps {
  onAddFiles?: () => void;
  onAddFolder?: () => void;
  className?: string;
}

const joinClasses = (...classes: Array<string | undefined | false>) =>
  classes.filter(Boolean).join(' ');

const FileFolderPickerActions: React.FC<FileFolderPickerActionsProps> = ({
  onAddFiles,
  onAddFolder,
  className,
}) => {
  if (!onAddFiles && !onAddFolder) return null;

  return (
    <div
      className={joinClasses(
        'inline-flex items-stretch overflow-hidden rounded-md border border-gray-700 bg-gray-800 text-xs font-medium shadow-sm',
        className
      )}
    >
      {onAddFiles && (
        <button
          type="button"
          onClick={onAddFiles}
          className="group flex h-full items-center gap-2 px-3 py-1.5 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
        >
          <Files className="w-3.5 h-3.5 text-gray-400 transition-colors group-hover:text-gray-200" />
          Add Files
        </button>
      )}

      {onAddFiles && onAddFolder && <div className="w-px bg-gray-700" />}

      {onAddFolder && (
        <button
          type="button"
          onClick={onAddFolder}
          className="group flex h-full items-center gap-2 px-3 py-1.5 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
        >
          <FolderUp className="w-3.5 h-3.5 text-gray-400 transition-colors group-hover:text-gray-200" />
          Add Folder
        </button>
      )}
    </div>
  );
};

export default FileFolderPickerActions;
