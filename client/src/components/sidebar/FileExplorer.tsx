import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  File,
  ChevronRight,
  ChevronDown,
  FilePlus,
  FolderPlus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { FileTreeItem } from '@shared/types.js';

export const FileExplorer: React.FC = () => {
  const {
    activeProject,
    fileTree,
    fetchFileTree,
    openFile,
    activeTabPath,
    createFile,
    deleteFile,
  } = useAppStore();

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    src: true,
  });
  const [newFileInputVisible, setNewFileInputVisible] = useState(false);
  const [newFolderInputVisible, setNewFolderInputVisible] = useState(false);
  const [newPathInput, setNewPathInput] = useState('');

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleCreate = async (isFolder: boolean) => {
    if (!newPathInput.trim()) {
      setNewFileInputVisible(false);
      setNewFolderInputVisible(false);
      return;
    }
    await createFile(newPathInput.trim(), isFolder);
    setNewPathInput('');
    setNewFileInputVisible(false);
    setNewFolderInputVisible(false);
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
      case 'json':
        return <FileJson className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
      case 'md':
      case 'txt':
        return <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      default:
        return <File className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
    }
  };

  const renderTree = (items: FileTreeItem[], depth = 0) => {
    return items.map((item) => {
      const isExpanded = expandedFolders[item.path] ?? false;
      const isActive = activeTabPath === item.path;

      if (item.isFolder) {
        return (
          <div key={item.id} className="select-none">
            <div
              onClick={() => toggleFolder(item.path)}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              className="flex items-center justify-between py-1 px-2 hover:bg-editor-hover cursor-pointer group text-xs text-zinc-300"
            >
              <div className="flex items-center space-x-1 truncate">
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-4 h-4 text-blue-400 shrink-0" />
                ) : (
                  <Folder className="w-4 h-4 text-zinc-400 shrink-0" />
                )}
                <span className="truncate">{item.name}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete folder ${item.path}?`)) deleteFile(item.path);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400"
                title="Delete Folder"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            {isExpanded && item.children && (
              <div>{renderTree(item.children, depth + 1)}</div>
            )}
          </div>
        );
      }

      return (
        <div
          key={item.id}
          onClick={() => openFile(item.path)}
          style={{ paddingLeft: `${depth * 12 + 20}px` }}
          className={`flex items-center justify-between py-1 px-2 cursor-pointer group text-xs transition-colors ${
            isActive
              ? 'bg-blue-600/20 text-white font-medium border-l-2 border-blue-500'
              : 'hover:bg-editor-hover text-zinc-300 hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-1.5 truncate">
            {getFileIcon(item.name)}
            <span className="truncate">{item.name}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete file ${item.path}?`)) deleteFile(item.path);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400"
            title="Delete File"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      );
    });
  };

  return (
    <div className="h-full flex flex-col bg-editor-sidebar select-none">
      {/* Header with Title & Action Icons */}
      <div className="h-9 px-3 border-b border-editor-border flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
        <span className="truncate">{activeProject?.name || 'Explorer'}</span>
        <div className="flex items-center space-x-1 text-zinc-400">
          <button
            onClick={() => {
              setNewFileInputVisible(true);
              setNewFolderInputVisible(false);
            }}
            className="p-1 hover:text-white hover:bg-editor-hover rounded"
            title="New File"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setNewFolderInputVisible(true);
              setNewFileInputVisible(false);
            }}
            className="p-1 hover:text-white hover:bg-editor-hover rounded"
            title="New Folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => fetchFileTree()}
            className="p-1 hover:text-white hover:bg-editor-hover rounded"
            title="Refresh Explorer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* New File / Folder inline input */}
      {(newFileInputVisible || newFolderInputVisible) && (
        <div className="p-2 border-b border-editor-border bg-editor-bg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate(newFolderInputVisible);
            }}
            className="flex items-center space-x-1"
          >
            {newFolderInputVisible ? (
              <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            ) : (
              <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            )}
            <input
              type="text"
              autoFocus
              placeholder={newFolderInputVisible ? 'folder/name' : 'filename.ts'}
              value={newPathInput}
              onChange={(e) => setNewPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setNewFileInputVisible(false);
                  setNewFolderInputVisible(false);
                }
              }}
              className="w-full px-1.5 py-0.5 text-xs bg-editor-sidebar border border-blue-500 rounded text-white focus:outline-none"
            />
          </form>
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {fileTree.length > 0 ? (
          renderTree(fileTree)
        ) : (
          <div className="p-4 text-xs text-zinc-500 text-center">
            Workspace is empty. Create a file to get started.
          </div>
        )}
      </div>
    </div>
  );
};
