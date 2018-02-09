define(function(require) {
    var QuestionView = require('coreViews/questionView');
    var Adapt = require('coreJS/adapt');

    var genericAnswerIndexOffset = 65536;

    var TextInputInline = QuestionView.extend({
        events: {
            "focus input":"clearValidationError"
        },

        resetQuestionOnRevisit: function() {
            this.setAllItemsEnabled(false);
            this.resetQuestion();
        },

        setupQuestion: function() {
            this.model.set( '_genericAnswerIndexOffset', genericAnswerIndexOffset );
            this.setupItemIndexes();
            this.restoreUserAnswer();
        },

        setupItemIndexes: function() {
            
            _.each(this.model.get('_items'), function(item, index) {

                if (item._index === undefined) item._index = index;
                if (item._answerIndex === undefined) item._answerIndex = -1;

            });

        },

        restoreUserAnswer: function() {
            if (!this.model.get("_isSubmitted")) return;

            var userAnswer = this.model.get("_userAnswer");
            var genericAnswers = this.model.get("_answers");
            _.each(this.model.get("_items"), function(item) {
                var answerIndex = userAnswer[item._index];
                if (answerIndex >= genericAnswerIndexOffset) {
                    item.userAnswer = genericAnswers[answerIndex - genericAnswerIndexOffset];
                    item._answerIndex = answerIndex;
                } else if (answerIndex > -1) {
                    item.userAnswer = item._answers[answerIndex];
                    item._answerIndex = answerIndex;
                } else {
                    if (item.userAnswer === undefined) item.userAnswer = "******";
                    item._answerIndex = -1;
                }
                if (item.userAnswer instanceof Array) item.userAnswer = item.userAnswer[0];
            });

            this.setQuestionAsSubmitted();
            this.markQuestion();
            this.setScore();
            this.showMarking();
            this.setupFeedback();
        },  

        disableQuestion: function() {
            this.setAllItemsEnabled(false);
        },

        enableQuestion: function() {
            this.setAllItemsEnabled(true);
        },

        setAllItemsEnabled: function(isEnabled) {
            _.each(this.model.get('_items'), function(item, index) {
                var $itemInput = this.$('input').eq(index);

                if (isEnabled) {
                    $itemInput.prop('disabled', false);
                } else {
                    $itemInput.prop('disabled', true);
                }
            }, this);
        },

        onQuestionRendered: function() {
            this.setReadyStatus();
        },

        clearValidationError: function() {
            this.$(".textinputinline-item-textbox").removeClass("textinputinline-validation-error");
        },

        // Use to check if the user is allowed to submit the question
        canSubmit: function() {
            var canSubmit = true;
            this.$(".textinputinline-item-textbox").each(function() {
                if ($(this).val() == "") {
                    canSubmit = false;
                }
            });
            return canSubmit;
        },

        // Blank method for question to fill out when the question cannot be submitted
        onCannotSubmit: function() {
            this.showValidationError();
        },

        showValidationError: function() {
            this.$(".textinputinline-item-textbox").addClass("textinputinline-validation-error");
        },

        //This preserve the state of the users answers for returning or showing the users answer
        storeUserAnswer: function() {
            var items = this.model.get('_items');
            _.each(items, function(item, index) {
                item.userAnswer = this.$('.textinputinline-item-textbox').eq(index).val();
            }, this);

            this.isCorrect();

            var userAnswer = new Array( items.length );
            _.each(items, function(item, index) {
                userAnswer[ item._index ] = item._answerIndex;
            });
            this.model.set("_userAnswer", userAnswer);
        },

        isCorrect: function() {
            if(this.model.get('_answers')) this.markGenericAnswers();
            else this.markSpecificAnswers();
            // do we have any _isCorrect == false?
            return !_.contains(_.pluck(this.model.get("_items"),"_isCorrect"), false);
        },

        // Allows the learner to give answers into any input, ignoring the order.
        // (this excludes any inputs which have their own specific answers).
        markGenericAnswers: function() {
            var numberOfCorrectAnswers = 0;
            var correctAnswers = this.model.get('_answers').slice();
            var usedAnswerIndexes = [];
            _.each(this.model.get('_items'), function(item, itemIndex) {
                _.each(correctAnswers, function(answerGroup, answerIndex) {
                    if(this.checkAnswerIsCorrect(answerGroup, item.userAnswer)) {
                        if (_.indexOf(usedAnswerIndexes, answerIndex) > -1) return;
                        usedAnswerIndexes.push(answerIndex);
                        item._isCorrect = true;
                        item._answerIndex = answerIndex + genericAnswerIndexOffset;
                        numberOfCorrectAnswers++;
                        this.model.set('_numberOfCorrectAnswers', numberOfCorrectAnswers);
                        this.model.set('_isAtLeastOneCorrectSelection', true);
                    }
                }, this);
                if(!item._isCorrect) item._isCorrect = false;
            }, this);
        },

        // Marks any items which have answers specific to it
        // (i.e. item has a _answers array)
        markSpecificAnswers: function() {
            var numberOfCorrectAnswers = 0;
            var numberOfSpecificAnswers = 0;
            _.each(this.model.get('_items'), function(item, index) {
                if(!item._answers) return;
                var userAnswer = item.userAnswer || ""; 
                if (this.checkAnswerIsCorrect(item["_answers"], userAnswer)) {
                    numberOfCorrectAnswers++;
                    item._isCorrect = true;
                    item._answerIndex = _.indexOf(item["_answers"], this.cleanupUserAnswer(userAnswer));
                    this.model.set('_numberOfCorrectAnswers', numberOfCorrectAnswers);
                    this.model.set('_isAtLeastOneCorrectSelection', true);
                } else {
                    item._isCorrect = false;
                    item._answerIndex = -1;
                }
                numberOfSpecificAnswers++;
            }, this);
        },

        checkAnswerIsCorrect: function(possibleAnswers, userAnswer) {
            var uAnswer = this.cleanupUserAnswer(userAnswer);
            var matched = _.filter(possibleAnswers, function(cAnswer){
                return this.cleanupUserAnswer(cAnswer) == uAnswer;
            }, this);
            
            var answerIsCorrect = matched && matched.length > 0;
            if (answerIsCorrect) this.model.set('_hasAtLeastOneCorrectSelection', true);
            return answerIsCorrect;
        },

        cleanupUserAnswer: function(userAnswer) {
            if (this.model.get('_allowsAnyCase')) {
                userAnswer = userAnswer.toLowerCase();
            }
            if (this.model.get('_allowsPunctuation')) {
                userAnswer = userAnswer.replace(/[\.,-\/#!$£%\^&\*;:{}=\-_`~()]/g, "");
                //remove any orphan double spaces and replace with single space (B & Q)->(B  Q)->(B Q)
                userAnswer = userAnswer.replace(/(  +)+/g, " ");
            }
            // removes whitespace from beginning/end (leave any in the middle)
            return $.trim(userAnswer);
        },

        // Used to set the score based upon the _questionWeight
        setScore: function() {
            var numberOfCorrectAnswers = this.model.get('_numberOfCorrectAnswers');
            var questionWeight = this.model.get("_questionWeight");
            var itemLength = this.model.get('_items').length;

            var score = questionWeight * numberOfCorrectAnswers / itemLength;

            this.model.set('_score', score);
        },

        // This is important and should give the user feedback on how they answered the question
        // Normally done through ticks and crosses by adding classes
        showMarking: function() {
            if (!this.model.get('_canShowMarking')) return;

            _.each(this.model.get('_items'), function(item, i) {
                var $item = this.$('.textinputinline-item').eq(i);
                $item.removeClass('correct incorrect').addClass(item._isCorrect ? 'correct' : 'incorrect');
            }, this);
        },

        isPartlyCorrect: function() {
            return this.model.get('_isAtLeastOneCorrectSelection');
        },

        resetUserAnswer: function() {
            _.each(this.model.get('_items'), function(item) {
                item["_isCorrect"] = false;
                item["userAnswer"] = "";
            }, this);
        },

        // Used by the question view to reset the look and feel of the component.
        resetQuestion: function() {
            this.$('.textinputinline-item-textbox').prop('disabled', !this.model.get('_isEnabled')).val('');

            this.model.set({
                _isAtLeastOneCorrectSelection: false,
                _isCorrect: undefined
            });
        },

        showCorrectAnswer: function() {
            
            if(this.model.get('_answers'))  {
                
                var correctAnswers = this.model.get('_answers');
                _.each(this.model.get('_items'), function(item, index) {
                    this.$(".textinputinline-item-textbox").eq(index).val(correctAnswers[index][0]);
                }, this);
                
            } else {
                _.each(this.model.get('_items'), function(item, index) {
                    this.$(".textinputinline-item-textbox").eq(index).val(item._answers[0]);
                }, this);
            }
            
        },

        hideCorrectAnswer: function() {
            _.each(this.model.get('_items'), function(item, index) {
                this.$(".textinputinline-item-textbox").eq(index).val(item.userAnswer);
            }, this);
        },

        /**
        * used by adapt-contrib-spoor to get the user's answers in the format required by the cmi.interactions.n.student_response data field
        * returns the user's answers as a string in the format "answer1[,]answer2[,]answer3"
        * the use of [,] as an answer delimiter is from the SCORM 2004 specification for the fill-in interaction type
        */
        getResponse: function() {
            return _.pluck(this.model.get('_items'), 'userAnswer').join('[,]');
        },

        /**
        * used by adapt-contrib-spoor to get the type of this question in the format required by the cmi.interactions.n.type data field
        */
        getResponseType: function() {
            return "fill-in";
        }
    });

    Adapt.register("textinputinline", TextInputInline);

    return TextInputInline;
});
