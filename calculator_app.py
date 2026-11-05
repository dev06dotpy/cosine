#!/usr/bin/env python3
"""
Modern Calculator App
A sleek, functional calculator with a modern UI design
"""

import tkinter as tk
from tkinter import ttk
import math
import re


class ModernCalculator:
    def __init__(self, root):
        self.root = root
        self.root.title("Modern Calculator")
        self.root.geometry("400x600")
        self.root.resizable(False, False)
        
        # Configure modern color scheme
        self.bg_color = "#2E2E2E"
        self.display_bg = "#1E1E1E"
        self.display_fg = "#FFFFFF"
        self.button_bg = "#3E3E3E"
        self.button_fg = "#FFFFFF"
        self.button_active = "#4E4E4E"
        self.operator_bg = "#FF9500"
        self.operator_fg = "#FFFFFF"
        self.operator_active = "#FFAA33"
        self.special_bg = "#A5A5A5"
        self.special_fg = "#000000"
        self.special_active = "#C5C5C5"
        
        # Configure window background
        self.root.configure(bg=self.bg_color)
        
        # Create main frame
        self.main_frame = tk.Frame(root, bg=self.bg_color, padx=20, pady=20)
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Initialize calculator state
        self.current_input = ""
        self.previous_input = ""
        self.operation = None
        self.reset_display = False
        self.memory = 0
        
        # Create display
        self.create_display()
        
        # Create buttons
        self.create_buttons()
        
        # Bind keyboard events
        self.bind_keyboard()
        
        # Set window icon (placeholder)
        try:
            self.root.iconname("Calculator")
        except:
            pass
    
    def create_display(self):
        """Create the display area with primary and secondary displays"""
        display_frame = tk.Frame(self.main_frame, bg=self.bg_color)
        display_frame.pack(fill=tk.X, pady=(0, 20))
        
        # Secondary display (for previous calculation)
        self.secondary_display = tk.Label(
            display_frame,
            text="",
            anchor=tk.E,
            bg=self.bg_color,
            fg="#888888",
            font=("Segoe UI", 14)
        )
        self.secondary_display.pack(fill=tk.X, pady=(0, 5))
        
        # Primary display
        self.primary_display = tk.Label(
            display_frame,
            text="0",
            anchor=tk.E,
            bg=self.display_bg,
            fg=self.display_fg,
            font=("Segoe UI", 32, "bold"),
            padx=20,
            relief=tk.FLAT,
            height=2
        )
        self.primary_display.pack(fill=tk.X)
    
    def create_buttons(self):
        """Create all calculator buttons with modern styling"""
        button_frame = tk.Frame(self.main_frame, bg=self.bg_color)
        button_frame.pack(fill=tk.BOTH, expand=True)
        
        # Button layout
        button_layout = [
            ["MC", "MR", "M+", "M-", "MS"],
            ["%", "√", "x²", "1/x", "CE"],
            ["C", "±", "⌫", "÷", "7"],
            ["8", "9", "×", "4", "5"],
            ["6", "-", "1", "2", "3"],
            ["+", "0", ".", "="]
        ]
        
        # Special button styling
        special_buttons = ["MC", "MR", "M+", "M-", "MS", "%", "√", "x²", "1/x", "CE", "C", "±", "⌫"]
        operator_buttons = ["÷", "×", "-", "+", "="]
        
        # Create buttons
        for row_idx, row in enumerate(button_layout):
            button_frame.rowconfigure(row_idx, weight=1)
            for col_idx, button_text in enumerate(row):
                button_frame.columnconfigure(col_idx, weight=1)
                
                # Determine button style
                if button_text in operator_buttons:
                    bg = self.operator_bg
                    fg = self.operator_fg
                    active_bg = self.operator_active
                elif button_text in special_buttons:
                    bg = self.special_bg
                    fg = self.special_fg
                    active_bg = self.special_active
                else:
                    bg = self.button_bg
                    fg = self.button_fg
                    active_bg = self.button_active
                
                # Create button
                btn = tk.Button(
                    button_frame,
                    text=button_text,
                    bg=bg,
                    fg=fg,
                    activebackground=active_bg,
                    activeforeground=fg,
                    font=("Segoe UI", 18, "bold"),
                    borderwidth=0,
                    relief=tk.FLAT,
                    highlightthickness=0,
                    command=lambda text=button_text: self.on_button_click(text)
                )
                btn.grid(row=row_idx, column=col_idx, sticky=tk.NSEW, padx=2, pady=2)
                
                # Make 0 button span 2 columns
                if button_text == "0":
                    btn.grid(columnspan=2, sticky=tk.NSEW)
                    button_frame.columnconfigure(col_idx + 1, weight=0)
                
                # Style the button with rounded corners effect
                btn.bind("<Enter>", lambda e, b=btn: b.config(bg=b.cget("activebackground")))
                btn.bind("<Leave>", lambda e, b=btn, bg=bg: b.config(bg=bg))
    
    def bind_keyboard(self):
        """Bind keyboard keys to calculator functions"""
        self.root.bind("<Key>", self.on_key_press)
        self.root.bind("<Return>", lambda e: self.on_button_click("="))
        self.root.bind("<Escape>", lambda e: self.on_button_click("C"))
        self.root.bind("<BackSpace>", lambda e: self.on_button_click("⌫"))
    
    def on_button_click(self, button_text):
        """Handle button click events"""
        if button_text.isdigit():
            self.add_digit(button_text)
        elif button_text == ".":
            self.add_decimal()
        elif button_text in ["+", "-", "×", "÷"]:
            self.set_operation(button_text)
        elif button_text == "=":
            self.calculate()
        elif button_text == "C":
            self.clear_all()
        elif button_text == "CE":
            self.clear_entry()
        elif button_text == "⌫":
            self.backspace()
        elif button_text == "±":
            self.toggle_sign()
        elif button_text == "%":
            self.percentage()
        elif button_text == "√":
            self.square_root()
        elif button_text == "x²":
            self.square()
        elif button_text == "1/x":
            self.reciprocal()
        elif button_text in ["MC", "MR", "M+", "M-", "MS"]:
            self.memory_operation(button_text)
    
    def on_key_press(self, event):
        """Handle keyboard input"""
        key = event.char
        keysym = event.keysym
        
        # Handle digit keys
        if key.isdigit():
            self.add_digit(key)
        # Handle decimal point
        elif key == ".":
            self.add_decimal()
        # Handle operator keys
        elif key in ["+", "-", "*", "/"]:
            operator_map = {"*": "×", "/": "÷"}
            self.set_operation(operator_map.get(key, key))
        # Handle equals
        elif keysym == "Return" or keysym == "equal":
            self.calculate()
        # Handle escape (clear)
        elif keysym == "Escape":
            self.clear_all()
        # Handle backspace
        elif keysym == "BackSpace":
            self.backspace()
    
    def add_digit(self, digit):
        """Add a digit to the current input"""
        if self.reset_display:
            self.current_input = ""
            self.reset_display = False
        
        self.current_input += digit
        self.update_display()
    
    def add_decimal(self):
        """Add a decimal point to the current input"""
        if self.reset_display:
            self.current_input = ""
            self.reset_display = False
        
        if "." not in self.current_input:
            if not self.current_input:
                self.current_input = "0"
            self.current_input += "."
            self.update_display()
    
    def set_operation(self, operator):
        """Set the current operation"""
        if self.current_input:
            if self.operation and not self.reset_display:
                self.calculate()
            self.previous_input = self.current_input
            self.operation = operator
            self.reset_display = True
            self.update_secondary_display()
    
    def calculate(self):
        """Perform the calculation"""
        if not self.operation or not self.previous_input:
            return
        
        try:
            prev = float(self.previous_input)
            current = float(self.current_input)
            
            if self.operation == "+":
                result = prev + current
            elif self.operation == "-":
                result = prev - current
            elif self.operation == "×":
                result = prev * current
            elif self.operation == "÷":
                if current == 0:
                    self.current_input = "Error"
                    self.update_display()
                    return
                result = prev / current
            
            # Format result
            if result.is_integer():
                self.current_input = str(int(result))
            else:
                self.current_input = str(result)
            
            self.operation = None
            self.previous_input = ""
            self.reset_display = True
            self.update_display()
            self.secondary_display.config(text="")
            
        except Exception as e:
            self.current_input = "Error"
            self.update_display()
    
    def clear_all(self):
        """Clear all calculator state"""
        self.current_input = ""
        self.previous_input = ""
        self.operation = None
        self.reset_display = False
        self.update_display()
        self.secondary_display.config(text="")
    
    def clear_entry(self):
        """Clear the current entry"""
        self.current_input = ""
        self.update_display()
    
    def backspace(self):
        """Remove the last character from current input"""
        if self.current_input:
            self.current_input = self.current_input[:-1]
            self.update_display()
    
    def toggle_sign(self):
        """Toggle the sign of the current input"""
        if self.current_input:
            try:
                value = float(self.current_input)
                self.current_input = str(-value)
                self.update_display()
            except:
                pass
    
    def percentage(self):
        """Convert current input to percentage"""
        if self.current_input:
            try:
                value = float(self.current_input)
                self.current_input = str(value / 100)
                self.update_display()
            except:
                pass
    
    def square_root(self):
        """Calculate square root of current input"""
        if self.current_input:
            try:
                value = float(self.current_input)
                if value < 0:
                    self.current_input = "Error"
                else:
                    result = math.sqrt(value)
                    if result.is_integer():
                        self.current_input = str(int(result))
                    else:
                        self.current_input = str(result)
                self.update_display()
            except:
                self.current_input = "Error"
                self.update_display()
    
    def square(self):
        """Square the current input"""
        if self.current_input:
            try:
                value = float(self.current_input)
                result = value ** 2
                if result.is_integer():
                    self.current_input = str(int(result))
                else:
                    self.current_input = str(result)
                self.update_display()
            except:
                self.current_input = "Error"
                self.update_display()
    
    def reciprocal(self):
        """Calculate reciprocal of current input"""
        if self.current_input:
            try:
                value = float(self.current_input)
                if value == 0:
                    self.current_input = "Error"
                else:
                    result = 1 / value
                    if result.is_integer():
                        self.current_input = str(int(result))
                    else:
                        self.current_input = str(result)
                self.update_display()
            except:
                self.current_input = "Error"
                self.update_display()
    
    def memory_operation(self, operation):
        """Handle memory operations"""
        if operation == "MC":  # Memory Clear
            self.memory = 0
        elif operation == "MR":  # Memory Recall
            self.current_input = str(self.memory)
            self.update_display()
            self.reset_display = False
        elif operation == "M+":  # Memory Add
            try:
                self.memory += float(self.current_input if self.current_input else "0")
            except:
                pass
        elif operation == "M-":  # Memory Subtract
            try:
                self.memory -= float(self.current_input if self.current_input else "0")
            except:
                pass
        elif operation == "MS":  # Memory Store
            try:
                self.memory = float(self.current_input if self.current_input else "0")
            except:
                pass
    
    def update_display(self):
        """Update the primary display"""
        display_text = self.current_input if self.current_input else "0"
        
        # Format large numbers with commas
        try:
            if "." in display_text:
                integer_part, decimal_part = display_text.split(".")
                formatted_integer = self.format_number(integer_part)
                display_text = f"{formatted_integer}.{decimal_part}"
            else:
                display_text = self.format_number(display_text)
        except:
            pass
        
        self.primary_display.config(text=display_text)
    
    def format_number(self, num_str):
        """Format number string with commas for thousands"""
        try:
            num = int(num_str)
            return f"{num:,}"
        except:
            return num_str
    
    def update_secondary_display(self):
        """Update the secondary display with current operation"""
        if self.previous_input and self.operation:
            display_text = f"{self.previous_input} {self.operation}"
            self.secondary_display.config(text=display_text)
        else:
            self.secondary_display.config(text="")


def main():
    """Main function to run the calculator"""
    root = tk.Tk()
    
    # Set modern theme if available
    try:
        root.tk.call("tk", "scaling", 2.0)
    except:
        pass
    
    # Create and run calculator
    calculator = ModernCalculator(root)
    root.mainloop()


if __name__ == "__main__":
    main()