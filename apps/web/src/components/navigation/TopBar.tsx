'use client';

import React from 'react';
import { Search, Sparkles, Activity } from 'lucide-react';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';

export const TopBar = () => {
  const { toggleDemoMode, isDemoMode } = useTimeMachineStore();

  return (
    <header
      style={{
        width: '100%',
        height: '64px',
        padding: '0 24px',
        backgroundColor: '#0F172A',
        borderBottom: '1px solid #1E293B',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #2563EB, #4F46E5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
          }}
        >
          <Sparkles style={{ width: '20px', height: '20px', color: '#FFFFFF' }} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 'bold', color: '#FFFFFF', fontSize: '15px', letterSpacing: '-0.02em' }}>
              BOB TIME MACHINE
            </span>
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(30, 58, 138, 0.4)',
                color: '#60A5FA',
                fontSize: '10px',
                fontFamily: 'monospace',
                border: '1px solid #1D4ED8',
              }}
            >
              DECISION INTELLIGENCE
            </span>
          </div>
          <p style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'monospace', margin: 0 }}>
            Continuous Causal Governance
          </p>
        </div>
      </div>

      {/* Omnisearch */}
      <div style={{ position: 'relative', width: '380px' }}>
        <Search style={{ width: '16px', height: '16px', color: '#64748B', position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text"
          placeholder="Search decisions, assumptions, or CVEs... (Cmd+K)"
          defaultValue="Why did we pick OpenShift for Payment Gateway?"
          style={{
            width: '100%',
            backgroundColor: '#06080F',
            color: '#E2E8F0',
            fontSize: '12px',
            fontFamily: 'monospace',
            paddingLeft: '38px',
            paddingRight: '12px',
            paddingTop: '8px',
            paddingBottom: '8px',
            borderRadius: '10px',
            border: '1px solid #334155',
            outline: 'none',
          }}
        />
      </div>

      {/* Action Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={toggleDemoMode}
          style={{
            padding: '6px 12px',
            borderRadius: '10px',
            border: isDemoMode ? '1px solid #EF4444' : '1px solid #334155',
            backgroundColor: isDemoMode ? '#DC2626' : '#06080F',
            color: isDemoMode ? '#FFFFFF' : '#CBD5E1',
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Activity style={{ width: '14px', height: '14px' }} />
          <span>{isDemoMode ? 'STAGE DEMO MODE: ACTIVE' : 'DEMO MODE'}</span>
        </button>

        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#1E293B',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#CBD5E1',
            fontWeight: 'bold',
          }}
        >
          IBM
        </div>
      </div>
    </header>
  );
};
