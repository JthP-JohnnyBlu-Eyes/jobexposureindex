# Anthropic Economic Index September 2025 Report Replication

## Folder Structure

```
.
├── code/                  # Analysis scripts
├── data/
│   ├── input/             # Raw data files (from external sources or prior releases)
│   ├── intermediate/      # Processed data files
│   └── output/            # Final outputs (plots, tables, etc.)
├── data_documentation.md  # Documentation of all data sources and datasets
└── README.md
```

## Data Processing Pipeline

**Note:** Since all preprocessed data files are provided, you can skip directly to the Analysis section (Section 2) if you want to replicate the results without re-running the preprocessing steps. Please refer to `data_documentation.md` for details on the different data used.

Run the following scripts in order from the `code/` directory:

### 1. Data Preprocessing

1. **`preprocess_iso_codes.py`**
   - Processes ISO country codes
   - Creates standardized country code mappings

2. **`preprocess_population.py`**
   - Processes country-level population data
   - Processes US state-level population data
   - Outputs working age population statistics

3. **`preprocess_gdp.py`**
   - Downloads and processes IMF country GDP data
   - Processes BEA US state GDP data
   - Creates standardized GDP datasets

4. **`preprocess_onet.py`**
   - Processes O*NET occupation and task data
   - Creates SOC occupation mappings

5. **`aei_report_v3_preprocessing_1p_api.ipynb`**
   - Jupyter notebook for preprocessing API and Claude.ai usage data
   - Prepares data for analysis

### 2. Analysis

#### Analysis Scripts

1. **`aei_report_v3_change_over_time_claude_ai.py`**
   - Analyzes automation trends across report versions (V1, V2, V3)
   - Generates comparison figures showing evolution of automation estimates

2. **`aei_report_v3_analysis_claude_ai.ipynb`**
   - Analysis notebook for Claude.ai usage patterns
   - Generates figures specific to Claude.ai usage
   - Uses functions from `aei_analysis_functions_claude_ai.py`

3. **`aei_report_v3_analysis_1p_api.ipynb`**
   - Main analysis notebook for API usage patterns
   - Generates figures for occupational usage, collaboration patterns, and regression analyses
   - Uses functions from `aei_analysis_functions_1p_api.py`

#### Supporting Function Files

- **`aei_analysis_functions_claude_ai.py`**
  - Core analysis functions for Claude.ai data
  - Platform-specific analysis and visualization functions

- **`aei_analysis_functions_1p_api.py`**
  - Core analysis functions for API data
  - Includes regression models, plotting functions, and data transformations
