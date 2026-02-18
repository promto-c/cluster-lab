import React from 'react';
import { AppStep } from '../types';
import { Cpu, Image, Layers, Network, Check, ArrowRight, Github } from 'lucide-react';

interface SidebarProps {
  currentStep: AppStep;
  setStep: (step: AppStep) => void;
  completedSteps: boolean[]; // Array of booleans [initDone, datasetDone, embedDone, clusterDone]
  hideBrandHeader?: boolean;
}

const STEPS = [
  { id: AppStep.INITIALIZE, label: 'Initialize', icon: Cpu, desc: 'Model Setup' },
  { id: AppStep.DATASET, label: 'Dataset', icon: Image, desc: 'Import Images' },
  { id: AppStep.EMBED, label: 'Embed', icon: Layers, desc: 'Inference' },
  { id: AppStep.CLUSTER, label: 'Cluster', icon: Network, desc: 'Analysis' },
];

const Sidebar: React.FC<SidebarProps> = ({ currentStep, setStep, completedSteps, hideBrandHeader = false }) => {
  return (
    <aside className="
        w-full md:w-64 
        h-auto md:h-full 
        bg-gray-950 border-t md:border-t-0 md:border-r border-gray-800 
        flex flex-row md:flex-col 
        shrink-0 z-50
    ">
      {/* Header - Hidden on Mobile */}
      {!hideBrandHeader && (
        <div className="hidden md:block px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 bg-gradient-to-br from-accent-600 to-accent-800 rounded-md flex items-center justify-center text-white shadow-lg shadow-accent-900/20 shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="font-bold text-[15px] tracking-tight text-white leading-none whitespace-nowrap">
                Cluster<span className="text-accent-500">Lab</span>
              </h1>
              <span className="px-1.5 py-0.5 rounded-md border border-gray-700 bg-gray-900 text-[9px] text-gray-400 uppercase tracking-wide font-semibold leading-none">
                v{__APP_VERSION__}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 md:p-4 flex flex-row md:flex-col justify-around md:justify-start gap-1 md:gap-2 overflow-x-auto md:overflow-y-auto">
        {STEPS.map((step, index) => {
           const isActive = currentStep === step.id;
           const isCompleted = completedSteps[index];
           const isLocked = index > 0 && !completedSteps[index - 1]; // Can't go to step N if N-1 is not done

           return (
             <div key={step.id} className="relative group flex-1 md:flex-none">
                {/* Connector Line - Desktop Only */}
                {index < STEPS.length - 1 && (
                  <div className={`hidden md:block absolute left-5 top-10 bottom-0 w-0.5 -z-10 h-6
                    ${isCompleted ? 'bg-accent-900/50' : 'bg-gray-800/50'}`} 
                  />
                )}

                <button
                  onClick={() => !isLocked && setStep(step.id)}
                  disabled={isLocked}
                  className={`
                    w-full flex md:flex-row flex-col items-center gap-1 md:gap-4 p-2 md:p-3 rounded-xl transition-all duration-300
                    ${isActive 
                       ? 'bg-transparent md:bg-gray-900 md:border md:border-gray-700 md:shadow-xl md:translate-x-1' 
                       : isLocked 
                         ? 'opacity-40 cursor-not-allowed' 
                         : 'hover:bg-gray-800/50 md:hover:bg-gray-900/50 md:hover:translate-x-1'
                    }
                  `}
                >
                  <div className={`relative w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 transition-colors
                    ${isActive 
                       ? 'border-accent-500 bg-accent-500/10 text-accent-400' 
                       : isCompleted 
                         ? 'border-green-500/30 bg-green-500/10 text-green-400'
                         : 'border-gray-800 bg-gray-900 text-gray-600'
                    }
                  `}>
                    {isCompleted && !isActive ? <Check className="w-4 h-4 md:w-5 md:h-5" /> : <step.icon className="w-4 h-4 md:w-5 md:h-5" />}
                  </div>

                  <div className="flex-1 text-center md:text-left">
                    <span className={`hidden md:block text-xs font-bold uppercase tracking-wider mb-0.5
                       ${isActive ? 'text-accent-400' : isCompleted ? 'text-green-400' : 'text-gray-500'}
                    `}>
                      Step 0{index + 1}
                    </span>
                    <span className={`text-[10px] md:text-sm font-semibold ${isActive ? 'text-white' : 'text-gray-400'}`}>
                      {step.label}
                    </span>
                  </div>

                  {isActive && <ArrowRight className="hidden md:block w-4 h-4 text-accent-500 animate-pulse" />}
                </button>
             </div>
           );
        })}
      </nav>

      {/* Footer Info - Hidden on Mobile */}
      <div className="hidden md:block p-4 border-t border-gray-800">
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800 mb-4">
          <h4 className="text-[10px] uppercase text-gray-500 font-bold mb-2">Session Status</h4>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-500">Model</span>
              <span className={completedSteps[0] ? 'text-green-400' : 'text-gray-600'}>{completedSteps[0] ? 'Ready' : 'Not Loaded'}</span>
            </div>
            <div className="flex justify-between text-[10px]">
               <span className="text-gray-500">Pipeline</span>
               <span className={completedSteps[1] ? 'text-accent-400' : 'text-gray-600'}>
                  {completedSteps[1] ? 'Active' : 'Idle'}
               </span>
            </div>
          </div>
        </div>
        
        {/* GitHub Badge */}
        <a 
          href="https://github.com/promto-c/cluster-lab"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 hover:bg-gray-800 transition-all group"
        >
          <Github className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors" />
          <div className="flex flex-col leading-none">
            <span className="text-[9px] text-gray-500 font-semibold uppercase mb-0.5">Developed by</span>
            <span className="text-[11px] text-gray-400 font-bold group-hover:text-accent-400 transition-colors">@promto-c</span>
          </div>
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
