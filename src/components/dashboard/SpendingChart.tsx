"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import styles from "./dashboard.module.css";
import { mockData } from "@/lib/mockData";

export default function SpendingChart() {
  const data = mockData.spendingData;

  return (
    <div className={styles.chartCard}>
      <h3>Spending this Month</h3>
      <div className={styles.donutWrapper}>
        <div style={{ width: 140, height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any) => [`${value}%`, 'Share']}
                contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-primary)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className={styles.donutLegend}>
          {data.map((item, index) => (
            <div key={index} className={styles.legendItem}>
              <div className={styles.legendLabel}>
                <div 
                  className={styles.legendDot} 
                  style={{ background: item.color }} 
                />
                {item.name}
              </div>
              <div className={styles.legendValue}>{item.value}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
