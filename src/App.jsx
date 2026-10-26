import { useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import dagre from '@dagrejs/dagre';
import { UploadCloud, Cpu } from 'lucide-react';

const getLayoutedElements = (nodes, edges) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 200;
  const nodeHeight = 60;

  // TB = Top to Bottom hierarchy
  dagreGraph.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      style: {
        background: '#0f172a',
        color: '#f8fafc',
        border: '1px solid #334155',
        borderRadius: '10px',
        padding: '12px 16px',
        fontSize: '13px',
        fontWeight: '600',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
      },
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:5000/api/v1/parser/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success) {
        const { nodes: rawNodes, edges: rawEdges } = response.data.data;
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          rawNodes,
          rawEdges
        );
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      }
    } catch (error) {
      console.error('File Upload Error:', error);
      alert('ZIP File එක Upload කිරීමේදී දෝෂයක් සිදු විය.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
      <aside className="w-80 border-r border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <Cpu className="w-8 h-8 text-indigo-500" />
            <h1 className="text-xl font-bold tracking-wider text-white">ArchitectAI</h1>
          </div>

          <div className="space-y-6">
            <div className="p-4 border-2 border-dashed border-slate-700 hover:border-indigo-500 transition-colors rounded-xl text-center bg-slate-950/40 cursor-pointer relative">
              <input
                type="file"
                accept=".zip"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <UploadCloud className="w-10 h-10 text-indigo-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-300">
                {fileName ? fileName : 'Upload Project ZIP'}
              </p>
              <p className="text-xs text-slate-500 mt-1">.zip files supported</p>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                Generating Tree Layout...
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 text-xs text-slate-500 flex justify-between">
          <span>Engine Status: Active</span>
          <span className="text-emerald-400">Port 5000</span>
        </div>
      </aside>

      <main className="flex-1 relative bg-slate-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
        >
          <Background color="#334155" gap={16} />
          <Controls className="bg-slate-800 border-slate-700 text-slate-200" />
        </ReactFlow>
      </main>
    </div>
  );
}