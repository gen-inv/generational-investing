import pandas as pd
import numpy as np
import sys

def transform_option_transactions(file_path, output_file=None):
    """
    Transform option transaction data by underlying symbol with merged buy/sell lines
    """
    try:
        # Read the CSV file
        print(f"Reading file: {file_path}")
        df = pd.read_csv(file_path, skiprows=1, header=0)
        
        # Keep only relevant columns
        df = df[['Date', 'Description', 'Transaction Type', 'Symbol', 'Quantity', 'Price', 
                 'Gross Amount', 'Commission', 'Net Amount']].copy()
        
        # Convert Date to datetime for sorting
        df['Date'] = pd.to_datetime(df['Date'])
        
        # Extract underlying symbol (first part of Symbol before space or underscore)
        df['Underlying'] = df['Symbol'].str.split().str[0]
        
        # Determine Buy/Sell and Cost/Proceeds
        df['Buy'] = np.where(df['Net Amount'] < 0, df['Quantity'].abs(), 0)
        df['Sell'] = np.where(df['Net Amount'] > 0, df['Quantity'].abs(), 0)
        df['Cost'] = np.where(df['Net Amount'] < 0, df['Gross Amount'].abs() + df['Commission'].abs(), 0)
        df['Proceeds'] = np.where(df['Net Amount'] > 0, df['Gross Amount'].abs() - df['Commission'].abs(), 0)
        
        # Group by Underlying, Description, Date, and sign of quantity
        df['Quantity_Sign'] = np.sign(df['Quantity'])
        
        print("Grouping and merging transactions...")
        grouped = df.groupby(['Underlying', 'Description', 'Date', 'Quantity_Sign']).agg({
            'Buy': 'sum',
            'Sell': 'sum',
            'Price': 'mean',
            'Cost': 'sum',
            'Proceeds': 'sum',
            'Commission': 'sum'
        }).reset_index()
        
        grouped = grouped.drop('Quantity_Sign', axis=1)
        
        # Sort by Underlying, then Date (ascending)
        grouped = grouped.sort_values(['Underlying', 'Date'])
        
        # Create output
        output_lines = []
        output_lines.append('Date,Symbol,Description,Price,Buy,Sell,Cost,Proceeds,Commission,XCH RATE,CAD Cost,CAD Proceeds,CAD P/L')
        
        current_underlying = None
        for _, row in grouped.iterrows():
            # Add section header when underlying changes
            if current_underlying != row['Underlying']:
                if current_underlying is not None:
                    output_lines.append('')  # Blank line between sections
                output_lines.append(f"--- {row['Underlying']} ---")
                current_underlying = row['Underlying']
            
            # Format the transaction line
            buy_str = str(int(row['Buy'])) if row['Buy'] > 0 else ''
            sell_str = str(int(row['Sell'])) if row['Sell'] > 0 else ''
            cost_str = f"{row['Cost']:.2f}" if row['Cost'] > 0 else ''
            proceeds_str = f"{row['Proceeds']:.2f}" if row['Proceeds'] > 0 else ''
            
            output_lines.append(
                f"{row['Date'].strftime('%Y-%m-%d')},{row['Underlying']},{row['Description']},"
                f"{row['Price']:.2f},{buy_str},{sell_str},{cost_str},{proceeds_str},{row['Commission']:.6f},,,,"
            )
        
        output_text = '\n'.join(output_lines)
        
        # Write to file or print
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(output_text)
            print(f"Output saved to: {output_file}")
        else:
            print(output_text)
            
        print(f"Processing complete! Total transactions processed: {len(grouped)}")
        
    except Exception as e:
        print(f"Error: {e}")
        return

if __name__ == "__main__":
    # Check command line arguments
    if len(sys.argv) < 2:
        print("Usage: python options_transform_taxes.py <input_file> [output_file]")
        print("Example: python options_transform_taxes.py U14113773.BUYSELL-OPTION-TRANSACTIONS.2025.csv output.csv")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    transform_option_transactions(input_file, output_file)