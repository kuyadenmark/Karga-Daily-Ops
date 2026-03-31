import React, { useState, useEffect, Fragment, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Package, Plus, Trash2, Edit2, X, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { exportToCSV } from '../lib/export';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

interface InventoryItem {
  id: string;
  product_name: string;
  product_number: string;
  quantity: number;
  type: 'general' | 'equipment';
  working_quantity: number;
  defective_quantity: number;
  created_at: string;
}

interface GroupedInventoryItem {
  name: string;
  totalQuantity: number;
  items: InventoryItem[];
}

export function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [productName, setProductName] = useState('');
  const [productNumber, setProductNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [type, setType] = useState<'general' | 'equipment'>('general');
  const [workingQuantity, setWorkingQuantity] = useState('');
  const [defectiveQuantity, setDefectiveQuantity] = useState('');
  const [persistName, setPersistName] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Filter items based on search query
  const filteredItems = items.filter(item => 
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.product_number && item.product_number.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Group items by product name
  const groupedItems = filteredItems.reduce((acc, item) => {
    if (!acc[item.product_name]) {
      acc[item.product_name] = {
        name: item.product_name,
        totalQuantity: 0,
        items: []
      };
    }
    acc[item.product_name].totalQuantity += Number(item.quantity);
    acc[item.product_name].items.push(item);
    return acc;
  }, {} as Record<string, GroupedInventoryItem>);

  function toggleGroup(name: string) {
    const next = new Set(expandedGroups);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpandedGroups(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productName) return;

    try {
      setAdding(true);
      setError(null);

      const itemData = {
        product_name: productName,
        product_number: productNumber,
        quantity: quantity ? Number(quantity) : 0,
        type: type,
        working_quantity: type === 'equipment' ? Number(workingQuantity || 0) : 0,
        defective_quantity: type === 'equipment' ? Number(defectiveQuantity || 0) : 0
      };

      if (editingItem) {
        // Check for duplicate, excluding the item being edited
        const isDuplicate = items.some(item => 
          item.id !== editingItem.id &&
          item.product_name.toLowerCase() === productName.toLowerCase() &&
          (item.product_number || '').toLowerCase() === (productNumber || '').toLowerCase()
        );
        if (isDuplicate) {
          setError('An item with this name and product number already exists.');
          setAdding(false);
          return;
        }

        const { error } = await supabase
          .from('inventory')
          .update(itemData)
          .eq('id', editingItem.id);
        if (error) throw error;
        resetForm();
      } else {
        // Check for duplicate
        const isDuplicate = items.some(item => 
          item.product_name.toLowerCase() === productName.toLowerCase() &&
          (item.product_number || '').toLowerCase() === (productNumber || '').toLowerCase()
        );
        if (isDuplicate) {
          setError('An item with this name and product number already exists.');
          setAdding(false);
          return;
        }

        const { error } = await supabase.from('inventory').insert([itemData]);
        if (error) throw error;
        
        if (!persistName) {
          resetForm();
        } else {
          setProductNumber(''); // Clear only code for next entry
        }
      }
      
      await fetchItems();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  function resetForm() {
    setProductName('');
    setProductNumber('');
    setQuantity('');
    setType('general');
    setWorkingQuantity('');
    setDefectiveQuantity('');
    setEditingItem(null);
  }

  function startEdit(item: InventoryItem) {
    setEditingItem(item);
    setProductName(item.product_name);
    setProductNumber(item.product_number || '');
    setQuantity(item.quantity.toString());
    setType(item.type || 'general');
    setWorkingQuantity(item.working_quantity?.toString() || '');
    setDefectiveQuantity(item.defective_quantity?.toString() || '');
  }

  async function deleteItem(id: string) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      const { error } = await supabase.from('inventory').delete().eq('id', id);
      if (error) throw error;
      await fetchItems();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function handleExport() {
    const exportData = items.map(item => ({
      Product: item.product_name,
      Code: item.product_number,
      Type: item.type,
      Quantity: item.quantity,
      Working: item.working_quantity,
      Defective: item.defective_quantity,
      Date: item.created_at
    }));
    exportToCSV(exportData, 'inventory_export');
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8 p-4"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Inventory</h2>
          <p className="mt-1 text-base text-gray-500">Manage your product stock.</p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex justify-center items-center px-4 py-2.5 border border-gray-200 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-colors"
        >
          <Download className="w-5 h-5 mr-2" />
          Export
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-sm">
          {error}
        </div>
      )}

      {/* Add/Edit Item Form */}
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
        <div className="md:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Enter product name"
            className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-2.5"
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Product Number</label>
          <input
            type="text"
            value={productNumber}
            onChange={(e) => setProductNumber(e.target.value)}
            placeholder="Enter product number (optional)"
            className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-2.5"
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Enter quantity"
            className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-2.5"
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'general' | 'equipment')}
            className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-2.5"
          >
            <option value="general">General</option>
            <option value="equipment">Equipment</option>
          </select>
        </div>
        {type === 'equipment' && (
          <>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Working</label>
              <input
                type="number"
                value={workingQuantity}
                onChange={(e) => setWorkingQuantity(e.target.value)}
                placeholder="0"
                className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-2.5"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Defective</label>
              <input
                type="number"
                value={defectiveQuantity}
                onChange={(e) => setDefectiveQuantity(e.target.value)}
                placeholder="0"
                className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-2.5"
              />
            </div>
          </>
        )}
        <div className="md:col-span-1 flex items-center gap-2">
          <input
            type="checkbox"
            id="persistName"
            checked={persistName}
            onChange={(e) => setPersistName(e.target.checked)}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
          />
          <label htmlFor="persistName" className="text-sm text-gray-600">Keep Name</label>
        </div>
        <div className="flex gap-2 md:col-span-6 justify-end">
          <button
            type="submit"
            disabled={adding || !productName}
            className="inline-flex justify-center items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : editingItem ? 'Update Item' : <Plus className="w-5 h-5 mr-2" />}
            {editingItem ? 'Update' : 'Add Item'}
          </button>
          {editingItem && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex justify-center items-center px-4 py-2.5 border border-gray-200 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </form>

      {/* Inventory Table */}
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or code..."
            className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-2.5"
          />
        </div>
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center">
            <Package className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-900">No items in inventory</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Name</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Quantity</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {(Object.values(groupedItems) as GroupedInventoryItem[])
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((group) => (
                  <Fragment key={group.name}>
                    <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => toggleGroup(group.name)}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                        {expandedGroups.has(group.name) ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        {group.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-bold">{group.totalQuantity} pcs</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center"></td>
                    </tr>
                    <AnimatePresence>
                      {expandedGroups.has(group.name) && (
                        <tr className="bg-gray-50/50">
                          <td colSpan={3} className="px-6 py-2">
                            <div className="space-y-2">
                              {group.items.map(item => (
                                <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                  <span className="text-sm text-gray-600">Code: {item.product_number || 'N/A'}</span>
                                  {item.type === 'equipment' ? (
                                    <div className="flex gap-4">
                                      <span className="text-sm font-medium text-green-600">Working: {item.working_quantity || 0}</span>
                                      <span className="text-sm font-medium text-red-600">Defective: {item.defective_quantity || 0}</span>
                                    </div>
                                  ) : (
                                    <span className="text-sm font-medium text-gray-900">{item.quantity} pcs</span>
                                  )}
                                  <div className="flex gap-2">
                                    <button onClick={() => startEdit(item)} className="text-indigo-600 hover:text-indigo-900 p-1">
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-900 p-1">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
