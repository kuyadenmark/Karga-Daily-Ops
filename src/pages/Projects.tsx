import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Briefcase, 
  Plus, 
  Loader2, 
  Box, 
  ArrowRight, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Paintbrush, 
  Search, 
  Send,
  Info,
  Trash2,
  Edit2,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const STATUS_WORKFLOW = [
  'PLACED',
  'MARKED FOR DAMAGE',
  'REPAIR',
  'PRIMER PAINT',
  'SECONDARY PAINT',
  'VISUAL INSPECT',
  'FINAL INSPECT',
  'BILLING',
  'BILLED'
];

interface Container {
  id: string;
  visual_code: string;
  kar_code: string | null;
  type: 'local' | 'foreign';
  status: string;
  platform_number: number | null;
  created_at: string;
}

export function Projects() {
  const [loading, setLoading] = useState(true);
  const [containers, setContainers] = useState<Container[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newContainer, setNewContainer] = useState({ 
    visual_code: '', 
    type: 'local' as 'local' | 'foreign',
    platform_number: null as number | null
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [karInput, setKarInput] = useState<{ id: string, value: string } | null>(null);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);

  useEffect(() => {
    fetchContainers();
    
    const channel = supabase
      .channel('containers_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'containers' }, () => {
        fetchContainers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchContainers() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('containers')
        .select('*')
        .not('status', 'eq', 'BILLED') // We only show active or billing-pending containers in projects if they are on platforms
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContainers(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const platforms = Array.from({ length: 6 }, (_, i) => {
    const platformNum = i + 1;
    const container = containers.find(c => c.platform_number === platformNum);
    return { number: platformNum, container };
  });

  const occupiedCount = platforms.filter(p => p.container).length;
  const isFull = occupiedCount >= 6;

  async function handleCreateContainer(e: React.FormEvent) {
    e.preventDefault();
    if (!newContainer.platform_number) {
      setError("Please select a platform");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const { error } = await supabase
        .from('containers')
        .insert([{
          visual_code: newContainer.visual_code,
          type: newContainer.type,
          status: 'PLACED',
          platform_number: newContainer.platform_number
        }]);

      if (error) throw error;

      setSuccess("Container created and placed on Platform " + newContainer.platform_number);
      setShowCreateModal(false);
      setNewContainer({ visual_code: '', type: 'local', platform_number: null });
      fetchContainers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleNextStep(container: Container) {
    const currentIndex = STATUS_WORKFLOW.indexOf(container.status);
    if (currentIndex === -1 || currentIndex >= STATUS_WORKFLOW.length - 2) return; // Cannot move past FINAL INSPECT here

    const nextStatus = STATUS_WORKFLOW[currentIndex + 1];

    try {
      const { error } = await supabase
        .from('containers')
        .update({ status: nextStatus })
        .eq('id', container.id);

      if (error) throw error;
      fetchContainers();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleAssignKarCode(containerId: string, value: string) {
    let formattedValue = value.trim();
    if (formattedValue && !formattedValue.startsWith('KAR-')) {
      formattedValue = `KAR-${formattedValue}`;
    }

    try {
      const { error } = await supabase
        .from('containers')
        .update({ kar_code: formattedValue })
        .eq('id', containerId);

      if (error) {
        if (error.message.includes('unique constraint')) {
          throw new Error("KAR Code must be unique");
        }
        throw error;
      }
      setKarInput(null);
      fetchContainers();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDeleteContainer(id: string) {
    try {
      const { error } = await supabase
        .from('containers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setSuccess("Container deleted successfully");
      setConfirmDelete(null);
      fetchContainers();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleUpdatePlatform(id: string, platformNumber: number) {
    try {
      const { error } = await supabase
        .from('containers')
        .update({ platform_number: platformNumber })
        .eq('id', id);

      if (error) throw error;
      setSuccess("Platform updated successfully");
      setEditingPlatform(null);
      fetchContainers();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleUpdateStatus(id: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('containers')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      setEditingStatus(null);
      fetchContainers();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleSendToBilling(container: Container) {
    try {
      const { error } = await supabase
        .from('containers')
        .update({ 
          status: 'BILLING',
          platform_number: null // Remove from platform
        })
        .eq('id', container.id);

      if (error) throw error;
      setSuccess("Container sent to Billing module");
      fetchContainers();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PLACED': return <Box className="w-4 h-4" />;
      case 'MARKED FOR DAMAGE': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'REPAIR': return <Paintbrush className="w-4 h-4 text-blue-500" />;
      case 'PRIMER PAINT':
      case 'SECONDARY PAINT': return <Paintbrush className="w-4 h-4 text-indigo-500" />;
      case 'VISUAL INSPECT':
      case 'FINAL INSPECT': return <Search className="w-4 h-4 text-emerald-500" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Project Dashboard (Operations)</h2>
          <p className="mt-1 text-base text-gray-500">Manage container platforms and workflow steps.</p>
        </div>
        <button
          onClick={() => {
            setNewContainer({ ...newContainer, platform_number: platforms.find(p => !p.container)?.number || null });
            setShowCreateModal(true);
          }}
          disabled={isFull}
          className="inline-flex justify-center items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Container
        </button>
      </div>

      {isFull && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl flex items-center shadow-sm">
          <Info className="w-5 h-5 mr-2" />
          No available platform. All 6 platforms are occupied.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center shadow-sm">
          <AlertTriangle className="w-5 h-5 mr-2" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <Plus className="w-4 h-4 rotate-45" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center shadow-sm">
          <CheckCircle2 className="w-5 h-5 mr-2" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">
            <Plus className="w-4 h-4 rotate-45" />
          </button>
        </div>
      )}

      {/* Platforms Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {platforms.map((p) => (
          <motion.div
            key={p.number}
            layout
            className={`relative rounded-3xl border-2 p-6 md:p-8 transition-all ${
              p.container 
                ? 'bg-white border-indigo-100 shadow-md hover:shadow-lg' 
                : 'bg-gray-50 border-dashed border-gray-200 flex items-center justify-center min-h-[220px] md:min-h-[260px]'
            }`}
          >
            <div className="absolute top-4 left-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
              Platform {p.number}
            </div>

            {!p.container ? (
              <div className="text-center">
                <Box className="w-12 h-12 text-gray-200 mx-auto mb-2" />
                <span className="text-lg font-bold text-gray-300 uppercase tracking-widest block">EMPTY</span>
                <button
                  onClick={() => {
                    setNewContainer({ ...newContainer, platform_number: p.number });
                    setShowCreateModal(true);
                  }}
                  className="mt-4 inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Place Container
                </button>
              </div>
            ) : (
              <div className="space-y-6 pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
                      {p.container.kar_code || p.container.visual_code}
                    </h3>
                    {p.container.kar_code && (
                      <p className="text-xs text-gray-500 mt-1">
                        (previous: {p.container.visual_code})
                      </p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      p.container.type === 'local' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {p.container.type}
                    </span>
                    <button
                      onClick={() => setConfirmDelete(p.container!.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Container"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {confirmDelete === p.container.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-2 overflow-hidden"
                    >
                      <p className="text-xs font-bold text-red-700">Confirm Deletion?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeleteContainer(p.container!.id)}
                          className="flex-1 py-1.5 bg-red-600 text-white text-[10px] font-bold rounded-lg hover:bg-red-700 transition-colors"
                        >
                          YES, DELETE
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="flex-1 py-1.5 bg-white border border-red-200 text-red-700 text-[10px] font-bold rounded-lg hover:bg-red-50 transition-colors"
                        >
                          CANCEL
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative">
                  <div className="flex items-center justify-between space-x-2 text-base font-medium text-gray-600 bg-gray-50 p-3 rounded-xl">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(p.container.status)}
                      <span>{p.container.status}</span>
                    </div>
                    <button
                      onClick={() => setEditingStatus(editingStatus === p.container!.id ? null : p.container!.id)}
                      className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                      title="Edit Status"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <AnimatePresence>
                    {editingStatus === p.container.id && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
                      >
                        <div className="max-h-48 overflow-y-auto">
                          {STATUS_WORKFLOW.map((status) => (
                            <button
                              key={status}
                              onClick={() => handleUpdateStatus(p.container!.id, status)}
                              className={`w-full text-left px-4 py-2 text-xs font-medium hover:bg-gray-50 transition-colors ${
                                p.container!.status === status ? 'text-indigo-600 bg-indigo-50' : 'text-gray-700'
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="relative">
                  <div className="flex items-center justify-between space-x-2 text-base font-medium text-gray-600 bg-gray-50 p-3 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <Briefcase className="w-4 h-4 text-gray-400" />
                      <span>Platform {p.number}</span>
                    </div>
                    <button
                      onClick={() => setEditingPlatform(editingPlatform === p.container!.id ? null : p.container!.id)}
                      className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                      title="Change Platform"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <AnimatePresence>
                    {editingPlatform === p.container.id && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
                      >
                        <div className="p-2 grid grid-cols-3 gap-1 bg-gray-50">
                          {platforms.map((plat) => (
                            <button
                              key={plat.number}
                              disabled={!!plat.container && plat.number !== p.number}
                              onClick={() => handleUpdatePlatform(p.container!.id, plat.number)}
                              className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${
                                plat.number === p.number
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : plat.container
                                    ? 'bg-gray-100 border-gray-100 text-gray-300 cursor-not-allowed'
                                    : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50'
                              }`}
                            >
                              P{plat.number}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="pt-6 space-y-3">
                  {/* Workflow Progress */}
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
                    <div 
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${((STATUS_WORKFLOW.indexOf(p.container.status) + 1) / STATUS_WORKFLOW.length) * 100}%` }}
                    />
                  </div>

                  {/* Actions */}
                  {p.container.status !== 'FINAL INSPECT' && p.container.status !== 'BILLING' && (
                    <button
                      onClick={() => handleNextStep(p.container!)}
                      className="w-full inline-flex justify-center items-center px-4 py-3 border border-gray-200 text-sm font-bold rounded-xl text-gray-700 bg-white hover:bg-gray-50 hover:border-indigo-300 transition-all shadow-sm"
                    >
                      Next Step: {STATUS_WORKFLOW[STATUS_WORKFLOW.indexOf(p.container.status) + 1]}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </button>
                  )}

                  {p.container.status === 'FINAL INSPECT' && (
                    <div className="space-y-2">
                      {karInput?.id === p.container.id ? (
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Enter KAR Code"
                            className="flex-1 border-gray-200 rounded-xl text-sm px-3 py-2 border focus:ring-2 focus:ring-indigo-500"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAssignKarCode(p.container!.id, (e.target as HTMLInputElement).value);
                              if (e.key === 'Escape') setKarInput(null);
                            }}
                            onBlur={(e) => handleAssignKarCode(p.container!.id, e.target.value)}
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setKarInput({ id: p.container!.id, value: '' })}
                          className="w-full inline-flex justify-center items-center px-4 py-2 border border-indigo-200 text-sm font-medium rounded-xl text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-all"
                        >
                          {p.container.kar_code ? 'Edit KAR Code' : 'Assign KAR Code'}
                        </button>
                      )}

                      <button
                        onClick={() => handleSendToBilling(p.container!)}
                        className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 transition-all"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Send to Billing
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-lg font-bold text-gray-900">New Container</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>
              <form onSubmit={handleCreateContainer} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Visual Code</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. VIS-001"
                    value={newContainer.visual_code}
                    onChange={(e) => setNewContainer({ ...newContainer, visual_code: e.target.value })}
                    className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border px-4 py-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewContainer({ ...newContainer, type: 'local' })}
                      className={`px-4 py-2.5 text-sm font-medium rounded-xl border transition-all ${
                        newContainer.type === 'local' 
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Local
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewContainer({ ...newContainer, type: 'foreign' })}
                      className={`px-4 py-2.5 text-sm font-medium rounded-xl border transition-all ${
                        newContainer.type === 'foreign' 
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Foreign
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                  <div className="grid grid-cols-3 gap-2">
                    {platforms.map((p) => (
                      <button
                        key={p.number}
                        type="button"
                        disabled={!!p.container}
                        onClick={() => setNewContainer({ ...newContainer, platform_number: p.number })}
                        className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${
                          newContainer.platform_number === p.number
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                            : p.container
                              ? 'bg-gray-100 border-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50'
                        }`}
                      >
                        P{p.number}
                        {p.container && <span className="block text-[8px] opacity-60">OCCUPIED</span>}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-sm font-bold rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create & Place'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
