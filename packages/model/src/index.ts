export type UnknownRecord = Record<string, unknown>;

export interface BaseNode {
  id: string;
  alias?: string;
  summary: string;
  raw: UnknownRecord;
}

export interface TriggerNode extends BaseNode {
  kind: "trigger";
  triggerType: string;
}

export interface ConditionNode extends BaseNode {
  kind: "condition";
  conditionType: string;
  children?: ConditionNode[];
}

export interface ServiceActionNode extends BaseNode {
  kind: "service";
  action: string;
}

export interface DeviceActionNode extends BaseNode {
  kind: "device-action";
  domain: string;
  actionType: string;
  deviceId?: string;
  entityId?: string;
}

export interface IfActionNode extends BaseNode {
  kind: "if";
  conditions: ConditionNode[];
  then: SequenceItem[];
  else: SequenceItem[];
}

export interface ChooseBranch {
  id: string;
  alias?: string;
  conditions: ConditionNode[];
  sequence: SequenceItem[];
}

export interface ChooseActionNode extends BaseNode {
  kind: "choose";
  choices: ChooseBranch[];
  default: SequenceItem[];
}

export interface DelayActionNode extends BaseNode {
  kind: "delay";
}

export interface WaitActionNode extends BaseNode {
  kind: "wait";
  waitType: "template" | "trigger";
  timeout?: unknown;
  continueOnTimeout: boolean;
}

export interface RepeatActionNode extends BaseNode {
  kind: "repeat";
  repeatType: "count" | "while" | "until" | "for_each" | "unknown";
  sequence: SequenceItem[];
}

export interface ParallelActionNode extends BaseNode {
  kind: "parallel";
  branches: SequenceItem[][];
}

export interface VariablesActionNode extends BaseNode {
  kind: "variables";
}

export interface StopActionNode extends BaseNode {
  kind: "stop";
}

export interface InlineConditionActionNode extends BaseNode {
  kind: "inline-condition";
  condition: ConditionNode;
}

export interface UnknownActionNode extends BaseNode {
  kind: "unknown";
}

export type SequenceItem =
  | ServiceActionNode
  | DeviceActionNode
  | IfActionNode
  | ChooseActionNode
  | DelayActionNode
  | WaitActionNode
  | RepeatActionNode
  | ParallelActionNode
  | VariablesActionNode
  | StopActionNode
  | InlineConditionActionNode
  | UnknownActionNode;

export interface AutomationModel {
  alias: string;
  id?: string;
  description?: string;
  mode?: string;
  triggers: TriggerNode[];
  conditions: ConditionNode[];
  actions: SequenceItem[];
  raw: UnknownRecord;
}

export interface ParseResult {
  automation: AutomationModel;
  warnings: string[];
}

export interface AutomationStats {
  triggers: number;
  conditions: number;
  actions: number;
  decisionPoints: number;
  maximumNesting: number;
  templates: number;
}

export interface Insight {
  level: "info" | "warning";
  nodeId?: string;
  message: string;
}

export interface EntityUsageDetail {
  nodeId: string;
  context: string;
}

export interface AnalysisResult {
  stats: AutomationStats;
  entities: string[];
  entityUsages: Record<string, string[]>;
  entityUsageDetails: Record<string, EntityUsageDetail[]>;
  actions: string[];
  insights: Insight[];
}

export interface PathStep {
  nodeId: string;
  label: string;
  detail?: string;
}

export interface ExecutionPath {
  id: string;
  title: string;
  outcome: "completed" | "stopped" | "truncated";
  steps: PathStep[];
}

export interface GraphNode {
  id: string;
  kind: "trigger" | "condition" | "action" | "control" | "wait" | "loop" | "parallel" | "stop" | "merge" | "unknown" | "end";
  label: string;
  subtitle?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface AutomationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
