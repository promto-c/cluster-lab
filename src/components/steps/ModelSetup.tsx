import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { ModelConfig, ModelSource, ResizeMethod, PadStyle } from '@/types';
import {
  DownloadCloud,
  Box,
  FileJson,
  Check,
  FolderOpen,
  ChevronDown,
  HardDrive,
  Binary,
  Palette,
  Grid,
  Activity,
  Maximize,
  Focus,
  Layout,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  FilePlus,
  Settings,
  Trash2,
} from 'lucide-react';
import CheckboxCard from '@/components/CheckboxCard';
import SelectDropdown, { type SelectDropdownOption } from '@/components/SelectDropdown';
import useMediaQuery from '@/utils/useMediaQuery';
import {
  clearModelBrowserCache,
  getDefaultRemoteOnnxFileName,
  getFallbackRemoteOnnxVariants,
  getModelBrowserCacheStatuses,
  listRemoteOnnxVariants,
  type ModelBrowserCacheStatus,
  type ModelDownloadProgressEntry,
  type RemoteOnnxVariantOption,
} from '@/services/dinoService';

interface ModelSetupProps {
  config: ModelConfig;
  onConfigChange: (config: ModelConfig) => void;
  onLoadModel: () => void;
  onWorkspaceSelect: (files: FileList) => void;
  status: string;
  modelDownloadProgress: ModelDownloadProgressEntry[];
}

const MODEL_HIERARCHY = [
  {
    label: 'DINOv2 (Standard)',
    options: [
      { name: 'ViT-S/14 Small', id: 'Xenova/dinov2-small' },
      { name: 'ViT-B/14 Base', id: 'Xenova/dinov2-base' },
      { name: 'ViT-L/14 Large', id: 'Xenova/dinov2-large' },
    ],
  },
];

const CLASSICAL_FEATURE_OPTIONS: Array<{
  key: keyof NonNullable<ModelConfig['classical']>;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
  defaultEnabled: boolean;
}> = [
  {
    key: 'colorHistogram',
    label: 'Color Histogram',
    description: 'Distribution of colors in RGB space (16 bins/channel).',
    Icon: Palette,
    iconClassName: 'text-pink-400',
    defaultEnabled: true,
  },
  {
    key: 'lbp',
    label: 'LBP (Texture)',
    description: 'Local Binary Patterns. Captures fine-grain texture details.',
    Icon: Grid,
    iconClassName: 'text-cyan-400',
    defaultEnabled: false,
  },
  {
    key: 'glcm',
    label: 'GLCM Stats',
    description: 'Gray-Level Co-occurrence. Contrast, Correlation, Energy, Homogeneity.',
    Icon: Activity,
    iconClassName: 'text-orange-400',
    defaultEnabled: false,
  },
  {
    key: 'hog',
    label: 'HOG',
    description: 'Histogram of Oriented Gradients. Captures shape and edge directions.',
    Icon: Grid,
    iconClassName: 'text-green-400',
    defaultEnabled: false,
  },
];

interface OnnxVariantDisplayMeta {
  title: string;
  subtitle: string;
  badge: string;
}

interface ModelRepoDisplayMeta {
  title: string;
  subtitle: string;
  badge?: string;
}

interface LocalModelRequirementCardProps {
  label: string;
  ready: boolean;
  icon: React.ComponentType<{ className?: string }>;
  accept: string;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

interface ResizeMethodCardProps {
  active: boolean;
  onSelect: () => void;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
  title: string;
  description: string;
  preview: React.ReactNode;
  details?: React.ReactNode;
}

const LocalModelRequirementCard: React.FC<LocalModelRequirementCardProps> = ({
  label,
  ready,
  icon: Icon,
  accept,
  onUpload,
}) => {
  if (ready) {
    return (
      <div className="p-3 rounded-lg border flex items-center justify-between bg-green-500/10 border-green-500/30">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-green-400" />
          <span className="text-sm text-gray-300">{label}</span>
        </div>
        <Check className="w-4 h-4 text-green-400" />
      </div>
    );
  }

  return (
    <label className="p-3 rounded-lg border flex items-center justify-between bg-red-500/10 border-red-500/30 cursor-pointer hover:bg-red-500/20 transition-colors group">
      <input type="file" accept={accept} className="hidden" onChange={onUpload} />
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-red-400" />
        <span className="text-sm text-gray-300 group-hover:text-gray-200">{label}</span>
      </div>
      <div className="flex items-center justify-center w-7 h-7 rounded-full text-red-300 bg-red-500/20 group-hover:bg-red-500/30 group-hover:text-red-200 transition-colors">
        <FilePlus className="w-4 h-4" />
      </div>
    </label>
  );
};

const ResizeMethodCard: React.FC<ResizeMethodCardProps> = ({
  active,
  onSelect,
  icon: Icon,
  iconClassName,
  title,
  description,
  preview,
  details,
}) => {
  return (
    <div
      onClick={onSelect}
      className={`relative cursor-pointer group rounded-xl border p-4 transition-all flex flex-col gap-3
        ${
          active
            ? 'bg-accent-900/10 border-accent-500 ring-1 ring-accent-500/50'
            : 'bg-gray-950/30 border-gray-800 hover:border-gray-600 hover:bg-gray-900'
        }
      `}
    >
      {preview}
      <div>
        <div className="flex items-center gap-2 font-bold text-sm text-gray-200">
          <Icon className={`w-4 h-4 ${iconClassName}`} /> {title}
        </div>
        <p className="text-[10px] text-gray-500 mt-1 leading-snug">{description}</p>
      </div>
      {active && (
        <div className="absolute top-2 right-2">
          <Check className="w-4 h-4 text-accent-500" />
        </div>
      )}
      {active && details}
    </div>
  );
};

function getOnnxVariantDisplayMeta(option: RemoteOnnxVariantOption): OnnxVariantDisplayMeta {
  const label = option.label?.trim() || option.fileName;
  const prefix = `${option.fileName} - `;
  const longLabel = label.startsWith(prefix) ? label.slice(prefix.length).trim() : label;
  const suffixMatch = longLabel.match(/\(([^()]+)\)\s*$/);
  const shortFromLabel = suffixMatch?.[1]?.trim();
  const shortFromFile = option.fileName
    .replace(/\.onnx$/i, '')
    .replace(/^model[_-]?/i, '')
    .trim();

  const title = (suffixMatch ? longLabel.slice(0, suffixMatch.index).trim() : longLabel) || option.fileName;
  const badge = (shortFromLabel || shortFromFile || 'onnx').trim();

  return {
    title,
    subtitle: option.fileName,
    badge,
  };
}

function getModelRepoDisplayMeta(option: { name: string; id: string }, isCached: boolean): ModelRepoDisplayMeta {
  return {
    title: option.name,
    subtitle: option.id,
    badge: isCached ? 'cached' : undefined,
  };
}

const ModelSetup: React.FC<ModelSetupProps> = ({
  config,
  onConfigChange,
  onLoadModel,
  onWorkspaceSelect,
  status,
  modelDownloadProgress,
}) => {
  const isLoading = status === 'loading_model';
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [showMobileCachePanel, setShowMobileCachePanel] = useState(false);
  const [showMobilePreprocessPanel, setShowMobilePreprocessPanel] = useState(false);
  const latestConfigRef = useRef(config);
  useEffect(() => {
    latestConfigRef.current = config;
  }, [config]);

  // Local File Analysis
  const localModelStatus = useMemo(() => {
    if (!config.localFiles || config.localFiles.length === 0)
      return {
        ready: false,
        files: [],
        onnxCount: 0,
        onnxFiles: [],
        hasConfig: false,
        hasPreprocessor: false,
      };
    const names = config.localFiles.map((f) => f.name.toLowerCase());
    const onnxFiles = config.localFiles.filter((f) => f.name.toLowerCase().endsWith('.onnx'));
    const hasConfig = names.includes('config.json');
    const hasPreprocessor = names.includes('preprocessor_config.json');
    return {
      ready: onnxFiles.length > 0,
      hasConfig,
      hasPreprocessor,
      onnxCount: onnxFiles.length,
      onnxFiles,
    };
  }, [config.localFiles]);

  // Set default filename if only one exists and none selected
  useEffect(() => {
    if (config.source === ModelSource.LOCAL && localModelStatus.onnxCount > 0 && !config.fileName) {
      // Auto-select the first one
      onConfigChange({
        ...config,
        fileName: localModelStatus.onnxFiles[0].name,
      });
    }
  }, [config.source, config.localFiles, localModelStatus, config.fileName]);

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onWorkspaceSelect(e.target.files);
    }
  };

  const handleSingleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onWorkspaceSelect(e.target.files);
    }
    // Clear input so same file can be selected again if needed
    e.target.value = '';
  };

  const handleClassicalToggle = (key: keyof NonNullable<ModelConfig['classical']>) => {
    const current = config.classical || {
      colorHistogram: true,
      lbp: false,
      glcm: false,
      hog: false,
    };
    onConfigChange({
      ...config,
      classical: { ...current, [key]: !current[key] },
    });
  };

  const allOptions = useMemo(() => MODEL_HIERARCHY.flatMap((g) => g.options), []);
  const isCustomId = !allOptions.find((o) => o.id === config.repoId);
  const fallbackRemoteVariants = useMemo(() => getFallbackRemoteOnnxVariants(), []);
  const [remoteOnnxVariants, setRemoteOnnxVariants] = useState<RemoteOnnxVariantOption[]>(fallbackRemoteVariants);
  const [isLoadingRemoteVariants, setIsLoadingRemoteVariants] = useState(false);
  const [remoteVariantMessage, setRemoteVariantMessage] = useState<string | null>(null);
  const selectedRemoteOnnxFile =
    config.remoteOnnxFile || getDefaultRemoteOnnxFileName(remoteOnnxVariants.map((variant) => variant.fileName));
  const selectedRemoteVariant =
    remoteOnnxVariants.find((variant) => variant.fileName === selectedRemoteOnnxFile) || null;
  const [modelCacheStatus, setModelCacheStatus] = useState<Record<string, ModelBrowserCacheStatus>>({});
  const [isCheckingCache, setIsCheckingCache] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const isOnnxVariantSelectorDisabled = isLoadingRemoteVariants || remoteOnnxVariants.length === 0;

  useEffect(() => {
    if (config.source !== ModelSource.HUGGINGFACE) return;

    const repoId = config.repoId.trim();
    if (!repoId) {
      const defaultVariant = getDefaultRemoteOnnxFileName(fallbackRemoteVariants.map((variant) => variant.fileName));
      setRemoteOnnxVariants(fallbackRemoteVariants);
      setRemoteVariantMessage(null);
      const latestConfig = latestConfigRef.current;
      if (latestConfig.remoteOnnxFile !== defaultVariant) {
        onConfigChange({ ...latestConfig, remoteOnnxFile: defaultVariant });
      }
      return;
    }

    let cancelled = false;
    const loadVariants = async () => {
      setIsLoadingRemoteVariants(true);
      setRemoteVariantMessage(null);

      try {
        const fetchedVariants = await listRemoteOnnxVariants(repoId);
        if (cancelled) return;

        const nextVariants = fetchedVariants.length > 0 ? fetchedVariants : fallbackRemoteVariants;
        setRemoteOnnxVariants(nextVariants);

        const nextDefaultVariant = getDefaultRemoteOnnxFileName(nextVariants.map((variant) => variant.fileName));
        const latestConfig = latestConfigRef.current;
        const hasCurrentVariant = nextVariants.some((variant) => variant.fileName === latestConfig.remoteOnnxFile);
        if (!hasCurrentVariant) {
          onConfigChange({
            ...latestConfig,
            remoteOnnxFile: nextDefaultVariant,
          });
        }

        if (fetchedVariants.length === 0) {
          setRemoteVariantMessage('No ONNX files were found under onnx/. Using fallback variants.');
        }
      } catch (error: any) {
        if (cancelled) return;

        const fallbackDefaultVariant = getDefaultRemoteOnnxFileName(
          fallbackRemoteVariants.map((variant) => variant.fileName),
        );
        setRemoteOnnxVariants(fallbackRemoteVariants);
        setRemoteVariantMessage('Could not fetch ONNX variants from the model repo. Using fallback variants.');

        const latestConfig = latestConfigRef.current;
        if (!fallbackRemoteVariants.some((variant) => variant.fileName === latestConfig.remoteOnnxFile)) {
          onConfigChange({
            ...latestConfig,
            remoteOnnxFile: fallbackDefaultVariant,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRemoteVariants(false);
        }
      }
    };

    loadVariants();
    return () => {
      cancelled = true;
    };
  }, [config.source, config.repoId, fallbackRemoteVariants, onConfigChange]);

  const refreshModelCacheStatus = useCallback(async () => {
    const modelIds = [...allOptions.map((option) => option.id)];
    if (config.repoId.trim()) {
      modelIds.push(config.repoId.trim());
    }

    setIsCheckingCache(true);
    try {
      const statuses = await getModelBrowserCacheStatuses(modelIds, selectedRemoteOnnxFile);
      setModelCacheStatus((prev) => ({ ...prev, ...statuses }));
    } finally {
      setIsCheckingCache(false);
    }
  }, [allOptions, config.repoId, selectedRemoteOnnxFile]);

  useEffect(() => {
    if (config.source !== ModelSource.HUGGINGFACE) return;
    refreshModelCacheStatus();
  }, [config.source, refreshModelCacheStatus]);

  useEffect(() => {
    if (config.source !== ModelSource.HUGGINGFACE) return;
    if (status !== 'ready') return;
    refreshModelCacheStatus();
  }, [config.source, status, refreshModelCacheStatus]);

  useEffect(() => {
    setCacheMessage(null);
  }, [config.repoId, selectedRemoteOnnxFile]);

  useEffect(() => {
    if (isMobile) return;
    setShowMobileCachePanel(false);
    setShowMobilePreprocessPanel(false);
  }, [isMobile]);

  const selectedRepoId = config.repoId.trim();
  const selectedCacheStatus = selectedRepoId ? modelCacheStatus[selectedRepoId] : null;
  const canClearSelectedCache = !!(selectedCacheStatus?.cacheAvailable && selectedCacheStatus.totalEntries > 0);
  const cacheModeLabel = selectedRemoteVariant?.label ?? selectedRemoteOnnxFile;
  const selectedModelRepoValue = isCustomId ? 'custom' : config.repoId;
  const modelRepoSelectorOptions = useMemo<SelectDropdownOption[]>(() => {
    const options: SelectDropdownOption[] = [];

    for (const group of MODEL_HIERARCHY) {
      for (const option of group.options) {
        const cacheStatus = modelCacheStatus[option.id];
        const display = getModelRepoDisplayMeta(option, !!(cacheStatus?.cacheAvailable && cacheStatus?.isFullyCached));
        options.push({
          value: option.id,
          label: display.title,
          description: display.subtitle,
          badge: display.badge,
          groupLabel: group.label,
        });
      }
    }

    options.push({
      value: 'custom',
      label: 'Custom HuggingFace ID',
      description: 'Manually enter any repo ID',
      badge: 'custom',
      groupLabel: 'Manual',
    });

    return options;
  }, [modelCacheStatus]);
  const onnxVariantSelectorOptions = useMemo<SelectDropdownOption[]>(() => {
    return remoteOnnxVariants.map((option) => {
      const display = getOnnxVariantDisplayMeta(option);
      return {
        value: option.fileName,
        label: display.title,
        description: display.subtitle,
        badge: display.badge,
      };
    });
  }, [remoteOnnxVariants]);
  const downloadProgressItems = useMemo(() => {
    return [...modelDownloadProgress].sort((a, b) => {
      if (a.stage !== b.stage) return a.stage.localeCompare(b.stage);
      return a.file.localeCompare(b.file);
    });
  }, [modelDownloadProgress]);
  const cacheStatusText = (() => {
    if (!selectedRepoId) return 'Enter a model ID to check cache status.';
    if (!selectedCacheStatus || isCheckingCache) return 'Checking browser cache...';
    if (!selectedCacheStatus.cacheAvailable) return 'Browser cache is unavailable in this context.';
    if (selectedCacheStatus.isFullyCached) {
      return `Downloaded in browser cache for ${cacheModeLabel} mode (${selectedCacheStatus.presentFiles}/${selectedCacheStatus.requiredFiles} required files).`;
    }
    return `Not fully downloaded for ${cacheModeLabel} mode (${selectedCacheStatus.presentFiles}/${selectedCacheStatus.requiredFiles} required files cached).`;
  })();

  const handleClearSelectedCache = async () => {
    if (!selectedRepoId) return;
    setIsClearingCache(true);
    try {
      const result = await clearModelBrowserCache(selectedRepoId);
      if (!result.cacheAvailable) {
        setCacheMessage('Browser cache is unavailable, so nothing could be removed.');
        return;
      }
      setCacheMessage(
        result.removedEntries > 0
          ? `Cleared ${result.removedEntries} cached entr${result.removedEntries === 1 ? 'y' : 'ies'} for ${selectedRepoId}.`
          : `No cached files were found for ${selectedRepoId}.`,
      );
      await refreshModelCacheStatus();
    } finally {
      setIsClearingCache(false);
    }
  };

  const formatBytes = (bytes?: number): string => {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    const fixed = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(fixed)} ${units[unitIndex]}`;
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto animate-fadeIn">
      <div className="text-center mb-4 md:mb-6 shrink-0 pt-1 md:pt-2 px-1">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Choose Model</h2>
        <p className="text-sm sm:text-base text-gray-400">
          Initialize a Vision Transformer model (DINOv2) or use Classical Feature Descriptors.
        </p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Tabs */}
        <div className="flex border-b border-gray-800 overflow-x-auto shrink-0 bg-gray-900 z-10">
          <button
            onClick={() => onConfigChange({ ...config, source: ModelSource.HUGGINGFACE })}
            className={`flex-1 py-3 md:py-4 text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap px-3 sm:px-4
                ${
                  config.source === ModelSource.HUGGINGFACE
                    ? 'bg-gray-800 text-white border-b-2 border-accent-500'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
          >
            <DownloadCloud className="w-4 h-4" />
            <span className="sm:hidden">Hub</span>
            <span className="hidden sm:inline">HuggingFace Hub</span>
          </button>
          <button
            onClick={() => onConfigChange({ ...config, source: ModelSource.LOCAL })}
            className={`flex-1 py-3 md:py-4 text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap px-3 sm:px-4
                ${
                  config.source === ModelSource.LOCAL
                    ? 'bg-gray-800 text-white border-b-2 border-accent-500'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
          >
            <HardDrive className="w-4 h-4" />
            <span className="sm:hidden">Local</span>
            <span className="hidden sm:inline">Local Folder</span>
          </button>
          <button
            onClick={() => onConfigChange({ ...config, source: ModelSource.CLASSICAL })}
            className={`flex-1 py-3 md:py-4 text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap px-3 sm:px-4
                ${
                  config.source === ModelSource.CLASSICAL
                    ? 'bg-gray-800 text-white border-b-2 border-accent-500'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
          >
            <Binary className="w-4 h-4" />
            <span className="sm:hidden">Classic</span>
            <span className="hidden sm:inline">Classical Features</span>
          </button>
        </div>

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-8 scrollbar-thin scrollbar-thumb-gray-700">
          <div className="space-y-6">
            {/* HF Mode */}
            {config.source === ModelSource.HUGGINGFACE && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Model Repository
                      </label>
                      <SelectDropdown
                        value={selectedModelRepoValue}
                        options={modelRepoSelectorOptions}
                        onChange={(nextValue) => {
                          if (nextValue === 'custom') {
                            onConfigChange({ ...config, repoId: '' });
                            return;
                          }
                          onConfigChange({ ...config, repoId: nextValue });
                        }}
                        ariaLabel="Model repository selector"
                        placeholderLabel="Select model repository"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">ONNX Variant</label>
                      <SelectDropdown
                        value={selectedRemoteOnnxFile}
                        options={onnxVariantSelectorOptions}
                        onChange={(nextValue) =>
                          onConfigChange({
                            ...config,
                            remoteOnnxFile: nextValue,
                          })
                        }
                        disabled={isOnnxVariantSelectorDisabled}
                        ariaLabel="ONNX variant selector"
                        placeholderLabel="Select ONNX variant"
                        emptyLabel={isLoadingRemoteVariants ? 'Loading ONNX variants...' : 'No ONNX variants available'}
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-500">
                    {isLoadingRemoteVariants
                      ? 'Fetching ONNX variants from the model repo...'
                      : remoteVariantMessage || `Using ${selectedRemoteOnnxFile} for model loading.`}
                  </p>

                  <div className="mt-3 space-y-2">
                    {isMobile && (
                      <button
                        type="button"
                        onClick={() => setShowMobileCachePanel((prev) => !prev)}
                        className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 text-left text-xs font-semibold text-gray-300"
                      >
                        <span>Browser Cache & Downloads</span>
                        <ChevronDown
                          className={`w-4 h-4 text-gray-500 transition-transform ${showMobileCachePanel ? 'rotate-180' : ''}`}
                        />
                      </button>
                    )}

                    {(!isMobile || showMobileCachePanel) && (
                      <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3 space-y-3 animate-fadeIn">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                              Browser Cache
                            </p>
                            <p
                              className={`text-xs mt-1 ${selectedCacheStatus?.cacheAvailable && selectedCacheStatus.isFullyCached ? 'text-green-400' : 'text-gray-400'}`}
                            >
                              {cacheStatusText}
                            </p>
                          </div>
                          {canClearSelectedCache && (
                            <button
                              type="button"
                              onClick={handleClearSelectedCache}
                              disabled={isClearingCache || isCheckingCache}
                              aria-label={isClearingCache ? 'Clearing cached model files' : 'Clear cached model'}
                              title={isClearingCache ? 'Clearing cached model files...' : 'Clear cached model'}
                              className={`inline-flex aspect-square items-center justify-center rounded-lg w-8 h-8 transition-colors
                                  ${
                                    isClearingCache || isCheckingCache
                                      ? 'bg-transparent text-gray-600 cursor-not-allowed'
                                      : 'bg-transparent text-gray-400 hover:bg-red-500/30 hover:text-red-200'
                                  }`}
                            >
                              <Trash2 className={`w-3.5 h-3.5 ${isClearingCache ? 'animate-pulse' : ''}`} />
                            </button>
                          )}
                        </div>
                        {cacheMessage && <p className="text-[11px] text-gray-500">{cacheMessage}</p>}

                        {isLoading && downloadProgressItems.length > 0 && (
                          <div className="pt-3 border-t border-gray-800/70 space-y-2">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                              Downloading Files
                            </p>
                            {downloadProgressItems.map((item) => (
                              <div key={item.id} className="space-y-1">
                                <div className="flex items-center justify-between gap-3 text-[11px]">
                                  <span className="text-gray-400 truncate">{item.file}</span>
                                  <span className={item.done ? 'text-green-400' : 'text-gray-400'}>
                                    {item.progress}%
                                  </span>
                                </div>
                                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-150 ${item.done ? 'bg-green-500' : 'bg-accent-500'}`}
                                    style={{
                                      width: `${Math.max(0, Math.min(100, item.progress))}%`,
                                    }}
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-gray-500">
                                  <span>{item.label}</span>
                                  <span>
                                    {item.total ? `${formatBytes(item.loaded)} / ${formatBytes(item.total)}` : ''}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Repo Link & Disclaimer */}
                  {!isCustomId && config.repoId && (
                    <div className="mt-3 bg-gray-950/50 border border-gray-800 rounded-lg p-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="flex gap-2 text-xs text-gray-400">
                          <AlertCircle className="w-4 h-4 shrink-0 text-gray-500 mt-0.5" />
                          <p className="leading-relaxed">Check usage terms on the model card.</p>
                        </div>
                        <a
                          href={`https://huggingface.co/${config.repoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-accent-400 hover:text-accent-300 flex items-center gap-1.5 transition-colors px-3 py-1.5 rounded-lg bg-accent-500/10 hover:bg-accent-500/20 whitespace-nowrap"
                        >
                          View Model Card <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {isCustomId && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">
                      Custom Model ID
                    </label>
                    <input
                      type="text"
                      value={config.repoId}
                      onChange={(e) => onConfigChange({ ...config, repoId: e.target.value })}
                      placeholder="e.g. facebook/dinov2-base or your-org/dinov3-custom"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-accent-500 outline-none placeholder-gray-600"
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Must be a valid HuggingFace repo ID compatible with{' '}
                      <span className="text-gray-400 font-mono">transformers.js</span> (contains ONNX weights).
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Classical Mode */}
            {config.source === ModelSource.CLASSICAL && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CLASSICAL_FEATURE_OPTIONS.map(({ key, label, description, Icon, iconClassName, defaultEnabled }) => {
                  const checked = config.classical?.[key] ?? defaultEnabled;

                  return (
                    <CheckboxCard
                      key={key}
                      checked={checked}
                      onChange={() => handleClassicalToggle(key)}
                      className="p-3"
                      contentClassName="pr-6"
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Icon className={`w-3 h-3 ${iconClassName}`} /> {label}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{description}</p>
                    </CheckboxCard>
                  );
                })}
              </div>
            )}

            {/* Local Mode */}
            {config.source === ModelSource.LOCAL && (
              <div className="space-y-6">
                <div className="relative group">
                  <input
                    type="file"
                    {...({ webkitdirectory: '', directory: '' } as any)}
                    multiple
                    onChange={handleFolderChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center bg-gray-950/30 group-hover:border-accent-500 group-hover:bg-gray-950/50 transition-all">
                    <FolderOpen className="w-12 h-12 text-gray-600 mb-4 group-hover:text-accent-500 transition-colors" />
                    <p className="text-base sm:text-lg font-medium text-gray-300">Select Model Folder</p>
                    <p className="text-xs sm:text-sm text-gray-500 text-center">
                      Click to select a local folder containing{' '}
                      <code className="bg-gray-900 px-1 py-0.5 rounded text-gray-300">model.onnx</code>
                      , <br />
                      <code className="bg-gray-900 px-1 py-0.5 rounded text-gray-300">config.json</code>, and{' '}
                      <code className="bg-gray-900 px-1 py-0.5 rounded text-gray-300">preprocessor_config.json</code>
                    </p>
                  </div>
                </div>

                {config.localFiles && config.localFiles.length > 0 && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <LocalModelRequirementCard
                        label="Model File"
                        ready={localModelStatus.ready}
                        icon={Box}
                        accept=".onnx"
                        onUpload={handleSingleFileUpload}
                      />
                      <LocalModelRequirementCard
                        label="Config"
                        ready={localModelStatus.hasConfig}
                        icon={FileJson}
                        accept=".json"
                        onUpload={handleSingleFileUpload}
                      />
                      <LocalModelRequirementCard
                        label="Preprocessor"
                        ready={localModelStatus.hasPreprocessor}
                        icon={Settings}
                        accept=".json"
                        onUpload={handleSingleFileUpload}
                      />
                    </div>

                    {/* ONNX Variant Selector */}
                    {localModelStatus.onnxCount > 1 && (
                      <div className="mt-2 animate-fadeIn">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">
                          Select Model Variant
                        </label>
                        <div className="relative">
                          <select
                            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 appearance-none focus:border-accent-500 outline-none text-sm"
                            value={config.fileName || ''}
                            onChange={(e) =>
                              onConfigChange({
                                ...config,
                                fileName: e.target.value,
                              })
                            }
                          >
                            {localModelStatus.onnxFiles.map((f) => (
                              <option key={f.name} value={f.name}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                        </div>
                      </div>
                    )}

                    {(!localModelStatus.ready || !localModelStatus.hasConfig || !localModelStatus.hasPreprocessor) && (
                      <p className="text-xs text-red-400 bg-red-900/10 p-2 rounded">
                        Status: Incomplete. Ensure all 3 components are present to initialize.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* --- Explicit Preprocessing Configuration --- */}
            {config.source !== ModelSource.CLASSICAL && (
              <div className="mt-6 md:mt-8 pt-5 md:pt-6 border-t border-gray-800">
                <div className="flex items-center justify-between gap-2 mb-3 md:mb-4">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    Image Preprocessing Pipeline
                  </h3>
                  {isMobile && (
                    <button
                      type="button"
                      onClick={() => setShowMobilePreprocessPanel((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] font-semibold text-gray-300"
                    >
                      {showMobilePreprocessPanel ? 'Hide' : 'Show'}
                      <ChevronDown
                        className={`w-3 h-3 text-gray-500 transition-transform ${showMobilePreprocessPanel ? 'rotate-180' : ''}`}
                      />
                    </button>
                  )}
                </div>
                {(!isMobile || showMobilePreprocessPanel) && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fadeIn">
                    <ResizeMethodCard
                      active={config.preprocessing.resizeMethod === ResizeMethod.PAD}
                      onSelect={() =>
                        onConfigChange({
                          ...config,
                          preprocessing: {
                            ...config.preprocessing,
                            resizeMethod: ResizeMethod.PAD,
                          },
                        })
                      }
                      icon={Layout}
                      iconClassName="text-green-400"
                      title="Letterbox Pad"
                      description="Resize to fit within target and fill borders with blur, mirror, or solid color."
                      preview={
                        <div className="flex items-center justify-center gap-4 h-16 bg-gray-900/50 rounded-lg border border-gray-800/50">
                          <div className="w-6 h-8 bg-gray-700 border border-gray-500 rounded-sm"></div>
                          <ArrowRight className="w-4 h-4 text-gray-600" />
                          <div className="w-8 h-8 bg-black border border-gray-700 rounded-sm flex items-center justify-center">
                            <div className="h-8 w-6 bg-gray-700 border border-gray-500"></div>
                          </div>
                        </div>
                      }
                      details={
                        <div
                          className="mt-2 pt-2 border-t border-gray-700/50 flex items-center justify-between animate-fadeIn"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] text-gray-400 font-semibold">Background</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                onConfigChange({
                                  ...config,
                                  preprocessing: {
                                    ...config.preprocessing,
                                    padStyle: PadStyle.BLUR,
                                  },
                                })
                              }
                              className={`w-5 h-5 rounded-full border transition-all overflow-hidden relative ${config.preprocessing.padStyle === PadStyle.BLUR ? 'border-white ring-2 ring-white/30 scale-110' : 'border-gray-600 hover:border-gray-400 opacity-80 hover:opacity-100'}`}
                              title="Smart Blur"
                            >
                              <div className="absolute inset-0 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 blur-[1px]" />
                            </button>
                            <button
                              onClick={() =>
                                onConfigChange({
                                  ...config,
                                  preprocessing: {
                                    ...config.preprocessing,
                                    padStyle: PadStyle.REFLECT,
                                  },
                                })
                              }
                              className={`w-5 h-5 rounded-full border transition-all overflow-hidden relative ${config.preprocessing.padStyle === PadStyle.REFLECT ? 'border-white ring-2 ring-white/30 scale-110' : 'border-gray-600 hover:border-gray-400 opacity-90 hover:opacity-100'}`}
                              title="Mirror / Reflect"
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-600 to-gray-200" />
                              <div className="absolute inset-y-0 left-1/2 w-px bg-gray-900/70 -translate-x-1/2" />
                            </button>
                            <button
                              onClick={() =>
                                onConfigChange({
                                  ...config,
                                  preprocessing: {
                                    ...config.preprocessing,
                                    padStyle: PadStyle.SOLID,
                                    padColor: '#000000',
                                  },
                                })
                              }
                              className={`w-5 h-5 rounded-full border transition-all ${config.preprocessing.padStyle === PadStyle.SOLID && config.preprocessing.padColor === '#000000' ? 'border-white ring-2 ring-white/30 scale-110' : 'border-gray-600 bg-black hover:border-gray-400'}`}
                              title="Solid Black"
                            />
                            <button
                              onClick={() =>
                                onConfigChange({
                                  ...config,
                                  preprocessing: {
                                    ...config.preprocessing,
                                    padStyle: PadStyle.SOLID,
                                    padColor: '#ffffff',
                                  },
                                })
                              }
                              className={`w-5 h-5 rounded-full border transition-all ${config.preprocessing.padStyle === PadStyle.SOLID && config.preprocessing.padColor === '#ffffff' ? 'border-white ring-2 ring-white/30 scale-110 bg-white' : 'border-gray-600 bg-white opacity-80 hover:opacity-100'}`}
                              title="Solid White"
                            />
                          </div>
                        </div>
                      }
                    />

                    <ResizeMethodCard
                      active={config.preprocessing.resizeMethod === ResizeMethod.STRETCH}
                      onSelect={() =>
                        onConfigChange({
                          ...config,
                          preprocessing: {
                            ...config.preprocessing,
                            resizeMethod: ResizeMethod.STRETCH,
                          },
                        })
                      }
                      icon={Maximize}
                      iconClassName="text-blue-400"
                      title="Stretch"
                      description="Image is resized to target dimensions (e.g. 224x224) ignoring aspect ratio. May distort shape."
                      preview={
                        <div className="flex items-center justify-center gap-4 h-16 bg-gray-900/50 rounded-lg border border-gray-800/50">
                          <div className="w-6 h-8 bg-gray-700 border border-gray-500 rounded-sm"></div>
                          <ArrowRight className="w-4 h-4 text-gray-600" />
                          <div className="w-8 h-8 bg-gray-700 border border-gray-500 rounded-sm"></div>
                        </div>
                      }
                    />

                    <ResizeMethodCard
                      active={config.preprocessing.resizeMethod === ResizeMethod.CROP}
                      onSelect={() =>
                        onConfigChange({
                          ...config,
                          preprocessing: {
                            ...config.preprocessing,
                            resizeMethod: ResizeMethod.CROP,
                          },
                        })
                      }
                      icon={Focus}
                      iconClassName="text-yellow-400"
                      title="Center Crop"
                      description="Resize shortest edge to target, then crop center. Preserves aspect ratio, loses edge info."
                      preview={
                        <div className="flex items-center justify-center gap-4 h-16 bg-gray-900/50 rounded-lg border border-gray-800/50">
                          <div className="w-6 h-8 bg-gray-700 border border-gray-500 rounded-sm relative overflow-hidden">
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-6 h-6 border-2 border-dashed border-yellow-500/70"></div>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-gray-600" />
                          <div className="w-8 h-8 bg-gray-700 border border-yellow-500/70 rounded-sm"></div>
                        </div>
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5 md:p-6 bg-gray-950/50 border-t border-gray-800 shrink-0 z-10">
          <button
            onClick={onLoadModel}
            disabled={
              isLoading ||
              (config.source === ModelSource.LOCAL &&
                (!localModelStatus.ready || !localModelStatus.hasConfig || !localModelStatus.hasPreprocessor))
            }
            className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 text-base font-bold transition-all shadow-xl
                ${
                  isLoading ||
                  (config.source === ModelSource.LOCAL &&
                    (!localModelStatus.ready || !localModelStatus.hasConfig || !localModelStatus.hasPreprocessor))
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-accent-600 hover:bg-accent-500 text-white shadow-accent-900/20 transform hover:-translate-y-1'
                }`}
          >
            {isLoading ? <DownloadCloud className="w-5 h-5 animate-bounce" /> : <DownloadCloud className="w-5 h-5" />}
            {isLoading
              ? 'Loading...'
              : config.source === ModelSource.CLASSICAL
                ? 'Configure Algorithms'
                : 'Initialize System'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelSetup;
