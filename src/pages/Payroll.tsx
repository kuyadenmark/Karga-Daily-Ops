import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Calculator, Calendar as CalendarIcon, Printer, X, CheckSquare, Square, FileText, Download } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { motion } from 'motion/react';
import { exportToCSV } from '../lib/export';

interface Employee {
  id: string;
  name: string;
  daily_rate: number;
}

interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  status: string | null;
}

interface Holiday {
  date: string;
  name: string;
  type: 'regular' | 'special';
}

interface PayrollRecord {
  employee_id: string;
  name: string;
  daily_rate: number;
  hourly_rate: number;
  total_regular_hours: number;
  total_ot_hours: number;
  total_holiday_hours: number;
  total_hours: number;
  overtime_hours: number;
  days_absent: number;
  days_present: number;
  regular_pay: number;
  ot_pay: number;
  holiday_pay: number;
  cash_advance: number;
  total_pay: number;
}

export function Payroll() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  
  const [payrollData, setPayrollData] = useState<PayrollRecord[]>([]);
  const [dbError, setDbError] = useState(false);
  
  // Selection and Payslip State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showPayslipModal, setShowPayslipModal] = useState(false);

  useEffect(() => {
    generatePayroll();
  }, [startDate, endDate]);

  async function generatePayroll() {
    if (!startDate || !endDate) return;
    console.log("Payroll range:", startDate, endDate);
    
    try {
      setLoading(true);
      setError(null);
      setSelectedIds([]); // Reset selection on new computation

      // 1. Fetch all employees
      const { data: empData, error: empError } = await supabase
        .from('employees')
        .select('id, name, daily_rate')
        .order('name');

      if (empError) throw empError;
      const employees: Employee[] = empData || [];

      // 2. Fetch attendance within date range
      const { data: attData, error: attError } = await supabase
        .from('attendance')
        .select('id, employee_id, date, time_in, time_out, status')
        .gte('date', startDate)
        .lte('date', endDate);

      if (attError) throw attError;
      const attendance: AttendanceRecord[] = attData || [];

      // 2.3 Fetch Holidays within date range
      const { data: holidayData, error: holidayError } = await supabase
        .from('holidays')
        .select('date, name, type')
        .gte('date', startDate)
        .lte('date', endDate);

      if (holidayError) throw holidayError;
      const holidays: Holiday[] = holidayData || [];
      const holidayMap = new Map<string, Holiday>();
      holidays.forEach(h => holidayMap.set(h.date, h));

      // 2.5 Fetch Cash Advances within date range
      const { data: caData, error: caError } = await supabase
        .from('cash_advances')
        .select('employee_id, amount')
        .gte('date', startDate)
        .lte('date', endDate);

      if (caError) {
        if (caError.message.includes('does not exist')) {
          setDbError(true);
          setLoading(false);
          return;
        }
        throw caError;
      }

      // 3. Compute Payroll
      const payrollMap = new Map<string, PayrollRecord>();
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      employees.forEach(emp => {
        const hourly_rate = emp.daily_rate / 8;
        payrollMap.set(emp.id, {
          employee_id: emp.id,
          name: emp.name,
          daily_rate: emp.daily_rate,
          hourly_rate: hourly_rate,
          total_regular_hours: 0,
          total_ot_hours: 0,
          total_holiday_hours: 0,
          total_hours: 0,
          overtime_hours: 0,
          days_absent: totalDays,
          days_present: 0,
          regular_pay: 0,
          ot_pay: 0,
          holiday_pay: 0,
          cash_advance: 0,
          total_pay: 0
        });
      });

      caData?.forEach(ca => {
        const empPayroll = payrollMap.get(ca.employee_id);
        if (empPayroll) {
          empPayroll.cash_advance += Number(ca.amount);
        }
      });

      attendance.forEach(record => {
        const empPayroll = payrollMap.get(record.employee_id);
        if (!empPayroll) return;

        // Absent logic
        if (record.status === 'present') {
          empPayroll.days_present += 1;
          empPayroll.days_absent -= 1;
        }

        // Work hours logic
        if (!record.time_in || !record.time_out) return;

        const timeIn = new Date(record.time_in).getTime();
        const timeOut = new Date(record.time_out).getTime();
        
        let totalHours = (timeOut - timeIn) / (1000 * 60 * 60);
        if (totalHours <= 0) return;

        let workHours = totalHours;
        if (totalHours >= 9) {
          workHours = totalHours - 1;
        }

        const regularHours = Math.min(8, workHours);
        const otHours = Math.max(0, workHours - 8);

        const holiday = holidayMap.get(record.date);
        if (holiday) {
          empPayroll.total_holiday_hours += workHours;
          // Holiday Pay Logic (PH Standard)
          // Regular Holiday: 200% (Double Pay)
          // Special Holiday: 130%
          const multiplier = holiday.type === 'regular' ? 2 : 1.3;
          empPayroll.holiday_pay += workHours * empPayroll.hourly_rate * multiplier;
        } else {
          empPayroll.total_regular_hours += regularHours;
          empPayroll.total_ot_hours += otHours;
          empPayroll.regular_pay += regularHours * empPayroll.hourly_rate;
          empPayroll.ot_pay += otHours * empPayroll.hourly_rate * 1.25; // Standard OT is 1.25x
        }

        empPayroll.total_hours += workHours;
        empPayroll.overtime_hours += otHours;
      });

      const finalPayroll: PayrollRecord[] = [];
      payrollMap.forEach(record => {
        record.total_pay = record.regular_pay + record.ot_pay + record.holiday_pay - record.cash_advance;
        finalPayroll.push(record);
      });

      setPayrollData(finalPayroll);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === payrollData.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(payrollData.map(p => p.employee_id));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  function handleExport() {
    const exportData = payrollData.map(p => ({
      Employee: p.name,
      RegularHours: p.total_regular_hours,
      OvertimeHours: p.total_ot_hours,
      HolidayHours: p.total_holiday_hours,
      DaysAbsent: p.days_absent,
      DaysPresent: p.days_present,
      RegularPay: p.regular_pay,
      OvertimePay: p.ot_pay,
      HolidayPay: p.holiday_pay,
      CashAdvance: p.cash_advance,
      TotalPay: p.total_pay
    }));
    exportToCSV(exportData, `payroll_${startDate}_${endDate}`);
  }

  const selectedPayslips = payrollData.filter(p => selectedIds.includes(p.employee_id));

  if (dbError) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-200">
          <h2 className="text-2xl font-semibold text-red-600 mb-4">Database Update Required</h2>
          <p className="text-gray-700 mb-4 text-base">
            To use the Cash Advance feature, you need to create the <code>cash_advances</code> table in your Supabase database.
          </p>
          <p className="text-gray-700 mb-4 text-base">
            Go to your Supabase Dashboard &gt; SQL Editor, and run the following query:
          </p>
          <pre className="bg-gray-900 text-emerald-400 p-4 rounded-xl overflow-x-auto text-sm mb-6 shadow-inner">
{`CREATE TABLE IF NOT EXISTS cash_advances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 font-medium transition-colors shadow-sm"
          >
            I have run the SQL query
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8 p-4"
    >
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Payroll Computation</h2>
          <p className="mt-1 text-base text-gray-500">
            Compute salary based on attendance. Daily rate is divided by 8 for the hourly rate.
          </p>
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-sm print:hidden">
          {error}
        </div>
      )}

      {/* Date Range Selector */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col sm:flex-row sm:items-end gap-5 print:hidden">
        <div className="flex-1">
          <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <CalendarIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="pl-10 block w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-2.5 transition-shadow"
            />
          </div>
        </div>
        <div className="flex-1">
          <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1.5">End Date</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <CalendarIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="pl-10 block w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-2.5 transition-shadow"
            />
          </div>
        </div>
        <button
          onClick={generatePayroll}
          disabled={loading}
          className="inline-flex justify-center items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 h-[46px] transition-colors"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calculator className="w-5 h-5 mr-2" />}
          Compute
        </button>
      </div>

      {/* Bulk Actions Bar */}
      {!loading && payrollData.length > 0 && (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-16 md:top-0 z-30 print:hidden">
          <button 
            onClick={toggleAll}
            className="text-sm font-medium text-gray-700 hover:text-indigo-600 flex items-center transition-colors"
          >
            {selectedIds.length === payrollData.length && payrollData.length > 0 ? (
              <CheckSquare className="w-5 h-5 mr-2 text-indigo-600" />
            ) : (
              <Square className="w-5 h-5 mr-2 text-gray-400" />
            )}
            {selectedIds.length > 0 ? `${selectedIds.length} Selected` : 'Select All'}
          </button>

          <button
            onClick={() => setShowPayslipModal(true)}
            disabled={selectedIds.length === 0}
            className="inline-flex justify-center items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Printer className="w-4 h-4 mr-2" />
            Generate Payslips ({selectedIds.length})
          </button>
        </div>
      )}

      {/* Payroll Table */}
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden print:hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
          </div>
        ) : payrollData.length === 0 ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center">
            <FileText className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-900">No payroll data found</p>
            <p className="text-sm text-gray-500 mt-1">Try selecting a different date range.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                    {/* Checkbox column */}
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Rates
                  </th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Hours (Total / OT)
                  </th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Absent Days
                  </th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Pay (Reg / OT)
                  </th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Holiday Pay
                  </th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Deductions (CA)
                  </th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Total Pay
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {payrollData.map((record) => {
                  const isSelected = selectedIds.includes(record.employee_id);
                  return (
                    <tr 
                      key={record.employee_id} 
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/50' : ''}`}
                      onClick={() => toggleSelection(record.employee_id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleSelection(record.employee_id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{record.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900 font-medium">₱ {record.daily_rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / day</div>
                        <div className="text-xs text-gray-500">₱ {record.hourly_rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / hr</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900 font-medium">{record.total_hours.toFixed(2)} hrs</div>
                        <div className="text-xs text-amber-600 font-medium">{record.overtime_hours.toFixed(2)} OT hrs</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900 font-medium">{record.days_absent}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900 font-medium">₱ {record.regular_pay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-xs text-amber-600 font-medium">₱ {record.ot_pay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900 font-medium">₱ {record.holiday_pay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-xs text-indigo-600 font-medium">{record.total_holiday_hours.toFixed(2)} Holiday hrs</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-red-600 font-medium">₱ {record.cash_advance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-base font-bold text-emerald-600">
                          ₱ {record.total_pay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50/80">
                <tr>
                  <td colSpan={7} className="px-6 py-5 text-right text-sm font-bold text-gray-900 uppercase tracking-wider">
                    Total Payroll:
                  </td>
                  <td className="px-6 py-5 text-right text-xl font-bold text-emerald-700">
                    ₱ {payrollData.reduce((sum, r) => sum + r.total_pay, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Payslip Modal */}
      {showPayslipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 print:p-0 print:bg-transparent print:static print:block">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-100 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col print:max-h-none print:shadow-none print:w-full print:bg-white overflow-hidden"
          >
            
            {/* Modal Header - Hidden on Print */}
            <div className="flex justify-between items-center p-5 border-b border-gray-200 bg-white print:hidden">
              <h3 className="text-lg font-semibold text-gray-900">Generated Payslips</h3>
              <div className="flex space-x-3">
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </button>
                <button
                  onClick={() => setShowPayslipModal(false)}
                  className="inline-flex items-center p-2 border border-gray-200 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body - Scrollable on screen, full height on print */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 print:p-0 print:space-y-0 print:overflow-visible bg-gray-50/50">
              {selectedPayslips.map((payslip, index) => (
                <div 
                  key={payslip.employee_id} 
                  className={`bg-white p-10 rounded-2xl shadow-sm border border-gray-200 max-w-2xl mx-auto print:shadow-none print:border-none print:max-w-none print:w-full ${index !== selectedPayslips.length - 1 ? 'print:break-after-page' : ''}`}
                >
                  {/* Payslip Header */}
                  <div className="border-b-2 border-gray-800 pb-5 mb-8 text-center">
                    <h1 className="text-3xl font-black text-gray-900 uppercase tracking-widest">PAYSLIP</h1>
                    <p className="text-sm font-medium text-gray-500 mt-2">
                      Period: <span className="text-gray-900">{format(new Date(startDate), 'MMM dd, yyyy')} - {format(new Date(endDate), 'MMM dd, yyyy')}</span>
                    </p>
                  </div>

                  {/* Employee Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10 bg-gray-50 p-5 rounded-xl border border-gray-100">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Employee Name</p>
                      <p className="text-xl font-bold text-gray-900">{payslip.name}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Rates</p>
                      <p className="text-sm font-medium text-gray-900">Daily: ₱ {payslip.daily_rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p className="text-sm font-medium text-gray-900">Hourly: ₱ {payslip.hourly_rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>

                  {/* Work Summary */}
                  <div className="mb-10">
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 border-b border-gray-200 pb-2">Work Summary</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <p className="text-xs text-gray-500 font-bold uppercase">Days Present</p>
                        <p className="text-lg font-bold text-emerald-600">{payslip.days_present}</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <p className="text-xs text-gray-500 font-bold uppercase">Absent Days</p>
                        <p className="text-lg font-bold text-red-600">{payslip.days_absent}</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <p className="text-xs text-gray-500 font-bold uppercase">Total Hours</p>
                        <p className="text-lg font-bold text-gray-900">{payslip.total_hours.toFixed(2)} hrs</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <p className="text-xs text-gray-500 font-bold uppercase">Overtime</p>
                        <p className="text-lg font-bold text-amber-600">{payslip.overtime_hours.toFixed(2)} hrs</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <p className="text-xs text-gray-500 font-bold uppercase">Holiday Hours</p>
                        <p className="text-lg font-bold text-indigo-600">{payslip.total_holiday_hours.toFixed(2)} hrs</p>
                      </div>
                    </div>
                  </div>

                  {/* Salary Breakdown */}
                  <div className="mb-10">
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 border-b border-gray-200 pb-2">Salary Breakdown</h4>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-right">
                      <p className="text-xs text-gray-500 font-bold uppercase">Daily Rate</p>
                      <p className="text-lg font-bold text-gray-900">₱ {payslip.daily_rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>

                  {/* Earnings Table */}
                  <table className="w-full mb-10">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Hours</th>
                        <th className="py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Rate</th>
                        <th className="py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="py-4 text-sm font-medium text-gray-900">Regular Pay</td>
                        <td className="py-4 text-sm text-gray-600 text-right">{payslip.total_regular_hours.toFixed(2)}</td>
                        <td className="py-4 text-sm text-gray-600 text-right">₱ {payslip.hourly_rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-4 text-sm font-bold text-gray-900 text-right">₱ {payslip.regular_pay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                      {payslip.total_ot_hours > 0 && (
                        <tr>
                          <td className="py-4 text-sm font-medium text-gray-900">Overtime Pay</td>
                          <td className="py-4 text-sm text-gray-600 text-right">{payslip.total_ot_hours.toFixed(2)}</td>
                          <td className="py-4 text-sm text-gray-600 text-right">₱ {payslip.hourly_rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-4 text-sm font-bold text-gray-900 text-right">₱ {payslip.ot_pay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      )}
                      {payslip.holiday_pay > 0 && (
                        <tr>
                          <td className="py-4 text-sm font-medium text-gray-900">Holiday Pay</td>
                          <td className="py-4 text-sm text-gray-600 text-right">{payslip.total_holiday_hours.toFixed(2)}</td>
                          <td className="py-4 text-sm text-gray-600 text-right">Variable</td>
                          <td className="py-4 text-sm font-bold text-gray-900 text-right">₱ {payslip.holiday_pay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      )}
                      {payslip.cash_advance > 0 && (
                        <tr>
                          <td className="py-4 text-sm font-medium text-red-600">Cash Advance Deduction</td>
                          <td className="py-4 text-sm text-gray-600 text-right">-</td>
                          <td className="py-4 text-sm text-gray-600 text-right">-</td>
                          <td className="py-4 text-sm font-bold text-red-600 text-right">- ₱ {payslip.cash_advance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Total */}
                  <div className="border-t-2 border-gray-800 pt-5 flex justify-between items-center bg-gray-50 p-5 rounded-b-2xl print:bg-transparent print:p-0">
                    <span className="text-lg font-bold text-gray-900 uppercase tracking-wider">Net Pay</span>
                    <span className="text-3xl font-black text-emerald-600">₱ {payslip.total_pay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  {/* Signatures */}
                  <div className="mt-16 grid grid-cols-2 gap-12">
                    <div className="border-t border-gray-400 pt-3 text-center">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Prepared By</p>
                    </div>
                    <div className="border-t border-gray-400 pt-3 text-center">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Received By (Signature)</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

