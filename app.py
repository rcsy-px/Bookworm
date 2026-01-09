from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

# Ha IDLE-ben akarod futtatni:
app.run(debug=False)  # debug nélkül indul
