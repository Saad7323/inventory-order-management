from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "inventory-order-management-midsemester-report.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleCenter", parent=styles["Title"], alignment=TA_CENTER, textColor=colors.HexColor("#172033"), spaceAfter=18))
styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], textColor=colors.HexColor("#2156a5"), spaceBefore=12, spaceAfter=7))
styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], fontSize=9.3, leading=13))

def p(text, style="BodySmall"):
    return Paragraph(text, styles[style])

def grid(rows, widths):
    table = Table(rows, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2156a5")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.3),
        ("LEADING", (0, 0), (-1, -1), 10.5),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#b9c5d6")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#62708a"))
    canvas.drawString(2 * cm, 1.25 * cm, "Inventory & Order Management System - Mid-Semester Report")
    canvas.drawRightString(A4[0] - 2 * cm, 1.25 * cm, f"Page {doc.page}")
    canvas.restoreState()

story = [p("Inventory & Order Management System", "TitleCenter"), p("Mid-Semester Evaluation Report", "Heading2"), Spacer(1, 10)]
story += [p("Project overview", "Section"), p("Small businesses can lose track of stock and customer orders when information is handled manually. This project provides a focused web application that stores products, displays stock levels, flags low-stock products, confirms customer orders only when inventory is available, and retains an audit trail of quantity changes.")]
story += [p("Scope", "Section"), p("<b>In scope:</b> product creation and maintenance, inventory visibility, low-stock status, restocking, multi-line order confirmation, stock validation, order history, and search. <b>Out of scope:</b> login, payments, suppliers, multiple warehouses, barcode scanning, and external integrations.")]
story += [p("Stakeholders", "Section"), grid([[p("Stakeholder"), p("Primary need")], [p("Inventory manager"), p("Accurate stock visibility and low-stock warnings.")], [p("Order-processing staff"), p("A quick way to confirm orders without overselling.")], [p("Business owner/administrator"), p("Reliable records of products, orders, and stock movements.")], [p("Course evaluator"), p("Traceable requirements, a working feature, tests, and design evidence.")]], [4.1*cm, 11.9*cm])]
story += [p("Functional requirements", "Section"), grid([[p("ID"), p("Requirement"), p("Priority")], [p("FR-01"), p("Create products with unique SKU, price, opening stock, and reorder level."), p("Must")], [p("FR-02"), p("View active inventory and identify low-stock products."), p("Must")], [p("FR-03"), p("Restock products while recording a stock movement."), p("Must")], [p("FR-04"), p("Create multi-line orders and validate combined requested stock."), p("Must")], [p("FR-05"), p("Confirm an order, deduct stock, and display the completed order."), p("Must")], [p("FR-06"), p("Search inventory and order history; edit or deactivate products."), p("Should")]], [1.4*cm, 11.8*cm, 2.8*cm])]
story.append(PageBreak())
story += [p("Architecture and database design", "Section"), p("The system uses Node.js with Express for the web interface, EJS for server-rendered pages, and SQLite for persistent local storage. The order service owns transactional confirmation; the inventory service owns product creation, restocking, editing, and deactivation.")]
story += [grid([[p("Table"), p("Purpose and key fields")], [p("products"), p("SKU, name, unit price, stock quantity, reorder level, active flag.")], [p("orders"), p("Customer name, status, total amount, creation timestamp.")], [p("order_items"), p("Order, product, quantity, and captured unit price.")], [p("stock_movements"), p("Product, optional order, signed quantity change, reason, timestamp.")]], [4*cm, 12*cm])]
story += [p("Integrity decisions", "Section"), p("Foreign keys are enabled. Product SKUs are unique. Prices and stock values cannot be negative. Duplicate lines in an order are combined before availability is checked. The order header, order items, inventory deductions, and negative stock movements are committed in one database transaction, so a rejected order leaves no partial data.")]
story += [p("Use cases", "Section"), p("<b>Confirm customer order:</b> staff enter a customer name, select one or more products and quantities, then confirm. The system validates stock, creates the order and items, deducts stock, creates movement records, and displays a confirmation. If any line exceeds stock, it displays an error and stores nothing.<br/><br/><b>Restock product:</b> an inventory manager enters a positive quantity next to a product. The system increases stock and stores a positive stock movement.")]
story += [p("Non-functional requirements", "Section"), p("The project prioritises transactional stock integrity, clear validation feedback, a small number of understandable screens, modular code, local portability, and automated tests.")]
story.append(PageBreak())
story += [p("Verification and delivery status", "Section"), p("The current automated suite contains <b>eight passing tests</b>. It verifies product creation, restocking, editing and deactivation, successful order confirmation, insufficient-stock rejection, duplicate-line validation, and two HTTP-level end-to-end order flows. Run <b>npm test</b> against the final source snapshot immediately before submission and attach the actual output or a screenshot.")]
story += [p("Demonstration plan", "Section"), grid([[p("Time"), p("Demonstration step")], [p("0:00-1:15"), p("Introduce dashboard, inventory fields, and low-stock state.")], [p("1:15-2:25"), p("Add or restock a product and explain auditability.")], [p("2:25-4:10"), p("Create a multi-line order, open confirmation, and show reduced stock.")], [p("4:10-5:15"), p("Attempt an unavailable quantity, then show order history and search.")], [p("5:15-6:30"), p("Explain the transaction design and show real test output.")]], [3*cm, 13*cm])]
story += [p("Project planning and contributions", "Section"), p("Team names, allocation, meeting records, and contribution evidence are intentionally not included because they must be completed from real team activity. The repository contains a contribution-record template for the team to fill in before submission.")]
story += [p("Submission checklist", "Section"), p("[ ] Review requirements with the team. [ ] Fill the contribution record from actual evidence. [ ] Re-run and capture test output. [ ] Add final wireframes or approved screenshots. [ ] Record a 5-7 minute demonstration. [ ] Export and submit this report PDF with the source-code snapshot.")]

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=1.8*cm, bottomMargin=2*cm, title="Inventory & Order Management System - Mid-Semester Report")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
