# Anthropic Economic Index: Insights from Claude 3.7 Sonnet
## Analysis Replication Notebook

This notebook contains the code used to produce the visualizations and analysis for the Anthropic Economic Index report based on Claude 3.7 Sonnet data. It analyzes how different occupations interact with AI systems through automation and augmentation patterns derived from real-world usage data.

## Data Files in this Directory

- **cluster_level_dataset**: A folder containing data released at the cluster level, including mappings to O*NET tasks, automation vs. augmentation, and "extended thinking" mode fraction
- **onet_task_statements.csv**: Contains O*NET task statements with their associated occupational codes
- **SOC_Structure.csv**: Standard Occupational Classification (SOC) structure data with major group codes and titles
- **task_pct_v1.csv**: Version 1 of task percentage data
- **task_pct_v2.csv**: Version 2 of task percentage data (current)
- **automation_vs_augmentation_by_task.csv**: Data on automation vs. augmentation classifications by task
- **automation_vs_augmentation_v1.csv**: Version 1 of automation vs. augmentation interaction type data
- **automation_vs_augmentation_v2.csv**: Version 2 of automation vs. augmentation interaction type data
- **task_thinking_fractions.csv**: Fraction of each O*NET task with its associated "extended thinking" mode fraction

## Data Dictionary

### onet_task_statements.csv
| Field | Description |
|-------|-------------|
| O*NET-SOC Code | Occupational code from the O*NET-SOC system |
| Title | Occupational title |
| Task | Description of specific occupational task |

### SOC_Structure.csv
| Field | Description |
|-------|-------------|
| Major Group | Two-digit code identifying major occupational group |
| SOC or O*NET-SOC 2019 Title | Title of the major occupational group |

### task_pct_v1.csv and task_pct_v2.csv
| Field | Description |
|-------|-------------|
| task_name | Normalized name of the task |
| pct | Percentage of task prevalence in dataset |

### automation_vs_augmentation_by_task.csv
| Field | Description |
|-------|-------------|
| task_name | Normalized name of the task |
| directive | Ratio indicating directive automation pattern (0-1) |
| feedback_loop | Ratio indicating feedback loop automation pattern (0-1) |
| validation | Ratio indicating validation augmentation pattern (0-1) |
| task_iteration | Ratio indicating task iteration augmentation pattern (0-1) |
| learning | Ratio indicating learning augmentation pattern (0-1) |
| filtered | Ratio indicating filtered (excluded) tasks (0-1) |

### automation_vs_augmentation_v1.csv and automation_vs_augmentation_v2.csv
| Field | Description |
|-------|-------------|
| interaction_type | Type of interaction (directive, feedback loop, validation, task iteration, learning, none) |
| pct | Percentage of this interaction type in the dataset |

### task_thinking_fractions.csv
| Field | Description |
|-------|-------------|
| task_name | Normalized name of the task |
| thinking_fraction | Ratio of this task that used extended thinking mode |

## Running the analysis
Open `v2_report_replication.ipynb` in a notebook editor and run the cells in order.