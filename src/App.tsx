/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Play, Square, Activity, Settings, RefreshCw, FileText, Clock } from 'lucide-react';

export default function App() {
  const [config, setConfig] = useState({
    loginUrl: 'http://1.20.251.38/myoffice/2567/index.php',
    inboxUrl: 'http://1.20.251.38/myoffice/2567/index.php?name=tkk4&file=rub&category=30',
    username: '31020030',
    password: '',
    lineToken: '',
    lineGroup: 'U283014a15f7b4b43f5a3dc7cf8699f3a',
    intervalMinutes: 15,
  });

  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('control');

  // Load saved config from localStorage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('botConfig');
    if (savedConfig) {
      setConfig((prev) => ({ ...prev, ...JSON.parse(savedConfig) }));
    }
  }, []);

  // Poll status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        setIsRunning(data.isScraping);
        setIsAutoRunning(data.isAutoRunning);
        setLogs(data.logs);
      } catch (e) {
        // Ignore fetch errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const newConfig = { ...config, [e.target.name]: e.target.value };
    setConfig(newConfig);
    localStorage.setItem('botConfig', JSON.stringify(newConfig));
  };

  const checkConfig = () => {
    if (!config.password || !config.lineToken) {
      alert("กรุณากรอกรหัสผ่าน (Password) และ LINE Token ให้ครบถ้วนในแท็บตั้งค่า");
      setActiveTab('settings');
      return false;
    }
    return true;
  }

  const startBot = async () => {
    if (!checkConfig()) return;
    try {
      const res = await fetch('/api/run-scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setIsRunning(true);
      } else {
        const data = await res.json();
        alert('Error: ' + data.error);
      }
    } catch (e: any) {
      alert('Network Error: ' + e.message);
    }
  };

  const toggleAutoRun = async () => {
    if (!isAutoRunning && !checkConfig()) return;

    try {
      const endpoint = isAutoRunning ? '/api/auto-run/stop' : '/api/auto-run/start';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          intervalMinutes: Number(config.intervalMinutes)
        }),
      });
      if (res.ok) {
        setIsAutoRunning(!isAutoRunning);
      } else {
        const data = await res.json();
        alert('Error: ' + data.error);
      }
    } catch (e: any) {
      alert('Network Error: ' + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-slate-900 text-white px-6 py-5 shadow-md flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            MyOffice Bot Control Panel
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            ระบบตรวจสอบหนังสือเข้าใหม่และแจ้งเตือนผ่าน LINE อัตโนมัติ
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full border ${isRunning ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-slate-700 text-slate-400 bg-slate-800'}`}>
            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
            {isRunning ? 'กำลังทำงาน' : 'สแตนด์บาย'}
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Sidebar Nav */}
        <div className="md:col-span-1 space-y-2">
          <button 
            onClick={() => setActiveTab('control')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'control' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Play className="w-4 h-4" /> ควบคุมบอท
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'logs' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <FileText className="w-4 h-4" /> บันทึกการทำงาน (Logs)
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'settings' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Settings className="w-4 h-4" /> ตั้งค่าระบบ
          </button>
        </div>

        {/* Content Area */}
        <div className="md:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[500px]">
          
          {activeTab === 'control' && (
            <div className="p-8 flex flex-col items-center justify-center h-full text-center">
              <div className="mb-6 p-4 rounded-full bg-slate-50 border border-slate-100 relative">
                <Activity className="w-12 h-12 text-indigo-500" />
                {isAutoRunning && (
                  <span className="absolute top-0 right-0 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white animate-pulse"></span>
                )}
              </div>
              <h2 className="text-2xl font-semibold mb-2">สั่งการบอท (Run Bot)</h2>
              <p className="text-slate-500 max-w-md mb-8">
                คุณสามารถกดดึงข้อมูลแบบ Manual 1 ครั้ง หรือตั้งให้บอททำงานอัตโนมัติตามเวลาที่กำหนด (Auto Run)
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-center bg-slate-50 p-6 rounded-xl border border-slate-200 w-full max-w-lg">
                <button 
                  onClick={startBot}
                  disabled={isRunning || isAutoRunning}
                  className={`flex-1 w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-white shadow-sm transition-all ${
                    isRunning || isAutoRunning
                      ? 'bg-slate-400 cursor-not-allowed' 
                      : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md active:scale-95'
                  }`}
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" /> กำลังตรวจสอบข้อมูล...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" /> สั่งงาน 1 ครั้ง (Manual)
                    </>
                  )}
                </button>

                <div className="h-px w-full sm:w-px sm:h-12 bg-slate-300"></div>

                <div className="flex-1 w-full flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <select
                      name="intervalMinutes"
                      value={config.intervalMinutes}
                      onChange={handleChange}
                      disabled={isAutoRunning}
                      className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5"
                    >
                      <option value="5">ทุก 5 นาที</option>
                      <option value="15">ทุก 15 นาที</option>
                      <option value="30">ทุก 30 นาที</option>
                      <option value="60">ทุก 1 ชั่วโมง</option>
                    </select>
                  </div>
                  <button 
                    onClick={toggleAutoRun}
                    className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-medium shadow-sm transition-all text-sm border ${
                      isAutoRunning 
                        ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:shadow-sm active:scale-95'
                    }`}
                  >
                    {isAutoRunning ? (
                      <>
                        <Square className="w-4 h-4" /> หยุดทำงานอัตโนมัติ
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4" /> เริ่มทำงานอัตโนมัติ
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="flex flex-col h-full bg-slate-950 text-slate-300 font-mono text-sm">
              <div className="p-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
                <span className="font-semibold text-white">System Logs</span>
                <span className="text-xs text-slate-500">Auto-refreshing...</span>
              </div>
              <div className="flex-1 p-4 overflow-y-auto max-h-[500px]">
                {logs.length === 0 ? (
                  <p className="text-slate-500 italic">No logs available. Start the bot to see output.</p>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={`mb-1 ${log.includes('ERROR') ? 'text-rose-400' : log.includes('New document') ? 'text-emerald-400' : ''}`}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="p-6 h-full overflow-y-auto">
              <h2 className="text-lg font-semibold mb-4 border-b pb-2">ตั้งค่าการเชื่อมต่อ (Configuration)</h2>
              <div className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Login URL</label>
                  <input type="text" name="loginUrl" value={config.loginUrl} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Inbox URL (ตารางหนังสือ)</label>
                  <input type="text" name="inboxUrl" value={config.inboxUrl} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                    <input type="text" name="username" value={config.username} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                    <input type="password" name="password" value={config.password} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">LINE Channel Access Token</label>
                  <input type="password" name="lineToken" value={config.lineToken} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">LINE Group ID / User ID</label>
                  <input type="text" name="lineGroup" value={config.lineGroup} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                  <p className="mt-1 text-xs text-slate-500">
                    * Group ID จะขึ้นต้นด้วยตัว C (เช่น C12345...), User ID ของคุณจะขึ้นต้นด้วยตัว U
                    (คำเตือน: หากขึ้น Error "You can't send messages to yourself" แสดงว่าคุณใส่ ID ของตัวบอทเอง ให้เปลี่ยนเป็น ID ของกลุ่ม หรือ ID ของผู้ใช้แทน)
                  </p>
                </div>
                
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>คำแนะนำ:</strong> ข้อมูลรหัสผ่านและ Token ของคุณจะถูกบันทึกไว้ในเบราว์เซอร์นี้ (Local Storage) เท่านั้น
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

