
        class Calculator {
            constructor(previousOperandElement, currentOperandElement) {
                this.previousOperandElement = previousOperandElement;
                this.currentOperandElement = currentOperandElement;
                this.memory = 0;
                this.clear();
            }

            clear() {
                this.currentOperand = '0';
                this.previousOperand = '';
                this.operation = undefined;
                this.shouldResetScreen = false;
                this.updateMemoryIndicator();
            }

            delete() {
                if (this.currentOperand.length === 1) {
                    this.currentOperand = '0';
                } else {
                    this.currentOperand = this.currentOperand.toString().slice(0, -1);
                }
            }

            appendNumber(number) {
                if (this.shouldResetScreen) {
                    this.currentOperand = '';
                    this.shouldResetScreen = false;
                }
                
                if (number === '.' && this.currentOperand.includes('.')) return;
                
                if (this.currentOperand === '0' && number !== '.') {
                    this.currentOperand = number;
                } else {
                    this.currentOperand = this.currentOperand.toString() + number.toString();
                }
            }

            chooseOperation(operation) {
                if (this.currentOperand === '') return;
                if (this.previousOperand !== '') {
                    this.compute();
                }
                this.operation = operation;
                this.previousOperand = this.currentOperand;
                this.currentOperand = '';
            }

            compute() {
                let computation;
                const prev = parseFloat(this.previousOperand);
                const current = parseFloat(this.currentOperand);
                if (isNaN(prev) || isNaN(current)) return;
                
                switch (this.operation) {
                    case '+':
                        computation = prev + current;
                        break;
                    case '-':
                        computation = prev - current;
                        break;
                    case '×':
                        computation = prev * current;
                        break;
                    case '÷':
                        if (current === 0) {
                            this.currentOperand = 'Error';
                            this.previousOperand = '';
                            this.operation = undefined;
                            return;
                        }
                        computation = prev / current;
                        break;
                    default:
                        return;
                }
                
                this.currentOperand = computation.toString();
                this.operation = undefined;
                this.previousOperand = '';
                this.shouldResetScreen = true;
            }

            memoryAdd() {
                const current = parseFloat(this.currentOperand);
                if (!isNaN(current)) {
                    this.memory += current;
                    this.updateMemoryIndicator();
                }
            }

            memorySubtract() {
                const current = parseFloat(this.currentOperand);
                if (!isNaN(current)) {
                    this.memory -= current;
                    this.updateMemoryIndicator();
                }
            }

            memoryRecall() {
                if (this.memory !== 0) {
                    this.currentOperand = this.memory.toString();
                    this.shouldResetScreen = true;
                }
            }

            memoryClear() {
                this.memory = 0;
                this.updateMemoryIndicator();
            }

            updateMemoryIndicator() {
                const memoryIndicator = document.getElementById('memoryIndicator');
                if (this.memory !== 0) {
                    memoryIndicator.classList.add('active');
                    memoryIndicator.innerHTML = `<i class="fas fa-memory"></i> <span>Memory: ${this.memory}</span>`;
                } else {
                    memoryIndicator.classList.remove('active');
                    memoryIndicator.innerHTML = `<i class="fas fa-memory"></i> <span>No Memory</span>`;
                }
            }

            getDisplayNumber(number) {
                if (number === 'Error') return number;
                
                const stringNumber = number.toString();
                const integerDigits = parseFloat(stringNumber.split('.')[0]);
                const decimalDigits = stringNumber.split('.')[1];
                let integerDisplay;
                
                if (isNaN(integerDigits)) {
                    integerDisplay = '';
                } else {
                    integerDisplay = integerDigits.toLocaleString('en', {
                        maximumFractionDigits: 0
                    });
                }
                
                if (decimalDigits != null) {
                    return `${integerDisplay}.${decimalDigits}`;
                } else {
                    return integerDisplay;
                }
            }

            updateDisplay() {
                this.currentOperandElement.innerText = 
                    this.getDisplayNumber(this.currentOperand);
                    
                if (this.operation != null) {
                    this.previousOperandElement.innerText = 
                        `${this.getDisplayNumber(this.previousOperand)} ${this.operation}`;
                } else {
                    this.previousOperandElement.innerText = '';
                }
            }
        }

        // Initialize calculator
        const previousOperandElement = document.querySelector('.previous-operand');
        const currentOperandElement = document.querySelector('.current-operand');
        const calculator = new Calculator(previousOperandElement, currentOperandElement);

        // Add event listeners to buttons
        document.querySelectorAll('button').forEach(button => {
            if (button.classList.contains('theme-toggle')) return;
            
            button.addEventListener('click', () => {
                if (button.classList.contains('number') || !isNaN(button.innerText)) {
                    calculator.appendNumber(button.innerText);
                    calculator.updateDisplay();
                } else if (button.classList.contains('operation')) {
                    calculator.chooseOperation(button.innerText);
                    calculator.updateDisplay();
                } else if (button.classList.contains('equals')) {
                    calculator.compute();
                    calculator.updateDisplay();
                } else if (button.classList.contains('clear')) {
                    calculator.clear();
                    calculator.updateDisplay();
                } else if (button.classList.contains('delete')) {
                    calculator.delete();
                    calculator.updateDisplay();
                }
            });
        });

        // Add number buttons dynamically
        document.querySelectorAll('button').forEach(button => {
            if (!isNaN(button.innerText) || button.innerText === '.') {
                button.classList.add('number');
            }
        });

        // Theme toggle functionality
        const themeToggle = document.getElementById('themeToggle');
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            if (document.body.classList.contains('dark-mode')) {
                themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            } else {
                themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            }
        });

        // Keyboard support
        document.addEventListener('keydown', event => {
            if ((event.key >= '0' && event.key <= '9') || event.key === '.') {
                calculator.appendNumber(event.key);
                calculator.updateDisplay();
            } else if (event.key === '+' || event.key === '-' || event.key === '*' || event.key === '/') {
                let operation;
                switch (event.key) {
                    case '+': operation = '+'; break;
                    case '-': operation = '-'; break;
                    case '*': operation = '×'; break;
                    case '/': operation = '÷'; break;
                }
                calculator.chooseOperation(operation);
                calculator.updateDisplay();
            } else if (event.key === 'Enter' || event.key === '=') {
                event.preventDefault();
                calculator.compute();
                calculator.updateDisplay();
            } else if (event.key === 'Backspace') {
                calculator.delete();
                calculator.updateDisplay();
            } else if (event.key === 'Escape') {
                calculator.clear();
                calculator.updateDisplay();
            } else if (event.key === 'm' || event.key === 'M') {
                // Memory functions with Ctrl key
                if (event.ctrlKey) {
                    if (event.shiftKey) {
                        calculator.memorySubtract();
                    } else {
                        calculator.memoryAdd();
                    }
                } else if (event.altKey) {
                    calculator.memoryRecall();
                }
            }
        });

